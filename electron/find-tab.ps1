# find-tab.ps1
# Searches every running Windows Terminal / OpenConsole window for a tab whose
# title matches -Title (case-insensitive, with whitespace-stripped fuzzy
# fallback). On match, brings the host window to the foreground and selects
# the tab via UIA, mirroring focus-window.ps1's selection-fallback chain.
#
# Adapted from claude-usage-tray's focus-window.ps1, but inverted: that script
# walks UP from a known PID to find a windowed ancestor; this one searches
# DOWN across all WT windows by tab title.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File find-tab.ps1 -Title 'MyAlias'
#
# Always exits 0 (unless catastrophic). Emits a single JSON line:
#   { "found": true,  "hostPid": 12345, "tabName": "MyAlias",
#     "tabSelected": true, "selectionError": null }
#   { "found": false }

param(
  [Parameter(Mandatory=$true)][string]$Title
)

$ErrorActionPreference = 'Stop'

$winSig = @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int n);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
Add-Type -MemberDefinition $winSig -Name W -Namespace U -ErrorAction SilentlyContinue | Out-Null

# SetForegroundWindow has anti-focus-stealing rules; the AttachThreadInput
# dance is the standard workaround when the calling process is not foreground.
function Set-Foreground {
  param([IntPtr]$Handle)
  if ([U.W]::IsIconic($Handle)) { [U.W]::ShowWindowAsync($Handle, 9) | Out-Null }
  $fgHwnd = [U.W]::GetForegroundWindow()
  $fgPid  = 0
  $fgThread = [U.W]::GetWindowThreadProcessId($fgHwnd, [ref]$fgPid)
  $myThread = [U.W]::GetCurrentThreadId()
  if ($fgThread -ne 0 -and $fgThread -ne $myThread) {
    [U.W]::AttachThreadInput($fgThread, $myThread, $true) | Out-Null
  }
  $ok = [U.W]::SetForegroundWindow($Handle)
  if ($fgThread -ne 0 -and $fgThread -ne $myThread) {
    [U.W]::AttachThreadInput($fgThread, $myThread, $false) | Out-Null
  }
  return $ok
}

try {
  Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes -ErrorAction SilentlyContinue | Out-Null
} catch { }

function Norm([string]$s) {
  if (-not $s) { return '' }
  return ($s -replace '\s+','').ToLowerInvariant()
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$wtHosts = @(Get-Process | Where-Object { 'WindowsTerminal','OpenConsole' -contains $_.ProcessName })

if ($wtHosts.Count -eq 0) {
  [pscustomobject]@{ found = $false; reason = 'no-wt-running' } | ConvertTo-Json -Compress
  exit 0
}

$matchedTab = $null
$matchedIndex = -1
$matchedName = $null
$matchedHostPid = 0
$matchedHwnd = [IntPtr]::Zero

$titleNorm = Norm $Title
$titleLower = $Title.ToLowerInvariant()

foreach ($h in $wtHosts) {
  try {
    $procCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$h.Id)
    $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $procCond)
    if (-not $window) { continue }
    $tabCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
    $tabs = @($window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCond))

    # Pass 1: case-insensitive equality.
    for ($i = 0; $i -lt $tabs.Count; $i++) {
      $name = $tabs[$i].Current.Name
      if (-not $name) { continue }
      if ($name.ToLowerInvariant() -eq $titleLower) {
        $matchedTab = $tabs[$i]; $matchedIndex = $i; $matchedName = $name
        $matchedHostPid = $h.Id; $matchedHwnd = $h.MainWindowHandle
        break
      }
    }
    if ($matchedTab) { break }

    # Pass 2: whitespace/case-insensitive substring match.
    for ($i = 0; $i -lt $tabs.Count; $i++) {
      $name = $tabs[$i].Current.Name
      if (-not $name) { continue }
      $nameNorm = Norm $name
      if ($titleNorm -and $nameNorm.Contains($titleNorm)) {
        $matchedTab = $tabs[$i]; $matchedIndex = $i; $matchedName = $name
        $matchedHostPid = $h.Id; $matchedHwnd = $h.MainWindowHandle
        break
      }
    }
    if ($matchedTab) { break }
  } catch { }
}

if (-not $matchedTab) {
  [pscustomobject]@{ found = $false } | ConvertTo-Json -Compress
  exit 0
}

# Foreground first; UIA Select frequently no-ops when host is in background.
[void](Set-Foreground -Handle $matchedHwnd)
Start-Sleep -Milliseconds 200

$tabSelected = $false
$selectionError = $null

# Strategy 1: SelectionItemPattern.Select
try {
  $sel = $matchedTab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
  if ($sel) { $sel.Select(); $tabSelected = $true }
} catch { $selectionError = "Select: $($_.Exception.Message)" }

# Strategy 2: InvokePattern.Invoke (acts like a click)
if (-not $tabSelected) {
  try {
    $inv = $matchedTab.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    if ($inv) { $inv.Invoke(); $tabSelected = $true; $selectionError = $null }
  } catch {
    if (-not $selectionError) { $selectionError = "Invoke: $($_.Exception.Message)" }
    else { $selectionError = "$selectionError; Invoke: $($_.Exception.Message)" }
  }
}

# Strategy 3: SendKeys Ctrl+<N> — WT's built-in tab-by-position keybind.
if (-not $tabSelected -and $matchedIndex -ge 0 -and $matchedIndex -lt 9) {
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue | Out-Null
    $key = '^{0}' -f ($matchedIndex + 1)
    [System.Windows.Forms.SendKeys]::SendWait($key)
    $tabSelected = $true; $selectionError = $null
  } catch {
    if (-not $selectionError) { $selectionError = "SendKeys: $($_.Exception.Message)" }
    else { $selectionError = "$selectionError; SendKeys: $($_.Exception.Message)" }
  }
}

[pscustomobject]@{
  found          = $true
  hostPid        = $matchedHostPid
  tabName        = $matchedName
  tabIndex       = $matchedIndex
  tabSelected    = $tabSelected
  selectionError = $selectionError
} | ConvertTo-Json -Compress -Depth 4
exit 0

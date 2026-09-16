$ErrorActionPreference = "Continue"
$PreferredPort = 3080
$MinPort = 3081
$MaxPort = 3099

function Get-ListenPids([int]$Port) {
  @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -gt 0 })
}

function Get-ProcessRecord([int]$ProcessId) {
  Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
}

function Test-DshCommandLine([string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
  if ($CommandLine -match 'apps\\cli\\src\\bin\.ts') { return $true }
  if ($CommandLine -match 'apps\\cli\\lib\\bin\.js') { return $true }
  if ($CommandLine -match '\bdsh\b' -and $CommandLine -match '\bweb\b') { return $true }
  return $false
}

function Get-SelfIds {
  $ids = New-Object "System.Collections.Generic.HashSet[int]"
  $cur = [int]$PID
  while ($cur -gt 0) {
    [void]$ids.Add($cur)
    $proc = Get-ProcessRecord $cur
    if ($null -eq $proc) { break }
    $cur = [int]$proc.ParentProcessId
  }
  return $ids
}

function Stop-DshOnPort([int]$Port) {
  $self = Get-SelfIds
  $pids = Get-ListenPids $Port
  $killed = $false
  foreach ($procId in $pids) {
    $id = [int]$procId
    if ($self.Contains($id)) { continue }
    $proc = Get-ProcessRecord $id
    if ($null -eq $proc) { continue }
    if (-not (Test-DshCommandLine ([string]$proc.CommandLine))) { continue }

    $chain = New-Object System.Collections.Generic.List[int]
    $cur = $id
    while ($cur -gt 0 -and -not $self.Contains($cur)) {
      $chain.Add($cur)
      $curProc = Get-ProcessRecord $cur
      if ($null -eq $curProc) { break }
      $name = [string]$curProc.Name
      if ($name -match '^(cmd|powershell|pwsh)\.exe$') { break }
      $cur = [int]$curProc.ParentProcessId
    }

    [Console]::Error.WriteLine("Stopping previous DeepSeek Harness on port $Port (PID $id).")
    foreach ($killId in $chain) {
      if ($self.Contains($killId)) { continue }
      Stop-Process -Id $killId -Force -ErrorAction SilentlyContinue
    }
    $killed = $true
  }
  if (-not $killed) { return $false }

  $deadline = (Get-Date).AddSeconds(6)
  do {
    if ((Get-ListenPids $Port).Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  return ((Get-ListenPids $Port).Count -eq 0)
}

function Test-PortFree([int]$Port) {
  return ((Get-ListenPids $Port).Count -eq 0)
}

function Find-FallbackPort {
  foreach ($port in $MinPort..$MaxPort) {
    if (Test-PortFree $port) { return $port }
  }
  return $null
}

if (Test-PortFree $PreferredPort) {
  Write-Output $PreferredPort
  exit 0
}

$listenerPids = Get-ListenPids $PreferredPort
$canReplace = $false
foreach ($procId in $listenerPids) {
  $proc = Get-ProcessRecord ([int]$procId)
  if ($null -ne $proc -and (Test-DshCommandLine ([string]$proc.CommandLine))) {
    $canReplace = $true
    break
  }
}

if ($canReplace -and (Stop-DshOnPort $PreferredPort)) {
  [Console]::Error.WriteLine("Port $PreferredPort is free.")
  Write-Output $PreferredPort
  exit 0
}

$next = Find-FallbackPort
if ($null -eq $next) {
  [Console]::Error.WriteLine("No free port available in $PreferredPort or $MinPort-$MaxPort.")
  exit 1
}
[Console]::Error.WriteLine("Port $PreferredPort is in use by another program. Using $next instead.")
Write-Output $next
exit 0
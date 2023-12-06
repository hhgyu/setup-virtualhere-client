[CmdletBinding()]
param (
  [Parameter(mandatory = $True)]
  [string]
  $VcBin
)

$virtualhere = Get-Process $VcBin -ErrorAction SilentlyContinue
if ($virtualhere) {
  $virtualhere.CloseMainWindow()
  Start-Sleep 1
  if (!$virtualhere.HasExited) {
    $virtualhere | Stop-Process -Force
  }
}
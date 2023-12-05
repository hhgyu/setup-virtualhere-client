[CmdletBinding()]
param (
  [Parameter(mandatory=$True)]
  [string]
  $VcBin
)

$virtualhere = Get-Process $VcBin -ErrorAction SilentlyContinue
if (!$virtualhere) {
  Write-Output 'vc-already=false'
  $VcBin -e -g
  sleep 1
} else {
  Write-Output 'vc-already=true'
}
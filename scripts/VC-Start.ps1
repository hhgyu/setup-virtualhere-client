[CmdletBinding()]
param (
  [Parameter(mandatory=$True)]
  [string]
  $VcBin
)

$virtualhere = Get-Process $VcBin -ErrorAction SilentlyContinue
if (!$virtualhere) {
  Write-Output 'vc-already=false'
  Start-Process -FilePath $VcBin -ArgumentList "-e -g"
  Start-Sleep 1
} else {
  Write-Output 'vc-already=true'
}
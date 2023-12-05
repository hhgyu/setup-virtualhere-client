[CmdletBinding()]
param (
  [Parameter(mandatory=$True)]
  [string]
  $Server
)

$ret = VC-Pipe "MANUAL HUB ADD,$Server"
if ($ret -eq 'OK') {
  Start-Sleep -Seconds 1
  Write-Host "Hub Added : $Server"
} else {
  throw [System.Exception]::new("Hub Not Add : $Server")
}
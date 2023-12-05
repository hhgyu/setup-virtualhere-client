[CmdletBinding()]
param (
  [Parameter()]
  [string]
  $Server,
  [Parameter()]
  [string]
  $DeviceName
)


$ret = VC-Pipe "MANUAL HUB ADD,$Server"
if ($ret -eq 'OK') {
  Write-Host "Hub Added"
}

Start-Sleep -Seconds 1

$already = "false"
$tokeAddress = $null
$start = (Get-Date)
do {
  $findRawTxt = VC-Pipe "LIST" | Select-String "\s+\-\-\>\s+" | findstr "$DeviceName"
  if ($null -eq $findRawTxt) {
    throw [System.Exception]::new("Not Found $DeviceName")
  }
  else {
    if ($findRawTxt.IndexOf('(In-use by you)') -ne -1) {
      Write-Host "Device Already!"
    }
    elseif ($findRawTxt.IndexOf('(In-use by:') -ne -1) {
      $runningMillis = (Get-Date).Subtract($start).TotalMilliseconds
      if ($runningMillis -gt 120000) {
        break
      }
    
      Write-Host "Device Other Host Used Sleep! $runningMillis"
      Start-Sleep -Seconds 5
      continue
    }

    $m = "$findRawTxt" | Select-String -Pattern "\s+\-\-\>\s+.+?\s+\((?<TokenAddress>.+)\)"
    if ($m.Matches.Success) {
      $tokeAddress = $m.Matches[0].Groups['TokenAddress'].Value
      if ($findRawTxt.IndexOf('(In-use by you)') -ne -1) {
        $already = "true"
      }
      break
    }
    else {
      throw [System.Exception]::new("Regex Match Failed $DeviceName -> [$findRawTxt]")
    }
  }
} while ($null -eq $tokeAddress);

if ($null -eq $tokeAddress) {
  throw [System.Exception]::new("While breaked. Not Found $DeviceName")
}

Start-Sleep -Seconds 1

$BakErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

$i = 0

do {
  if ($i -ne 0) {
    # 재시도
    Start-Sleep -Seconds 1
  
    Write-Host "Repeat Count : $i"
  }

  try {
    $ret = VC-Pipe "USE,$tokeAddress"
    if ($ret -eq 'OK') {
      Write-Host "Device Added: $DeviceName - $tokeAddress"
      return @($True, $tokeAddress, $already)
    }
  }
  catch {
    # 실패했다고 했지만 List를 조회 해보면 이미 연결 처리가 됨
    $findRawTxt = VC-Pipe "LIST" | Select-String "\s+\-\-\>\s+" | findstr "$DeviceName"
    if ($null -ne $findRawTxt -Or $findRawTxt.IndexOf('(In-use by you)') -ne -1) {
      Write-Host "Device Added: $DeviceName - $tokeAddress"
      return @($True, $tokeAddress, $already)
    }

    Write-Host "Error:"$_.Exception.Message
  }
  
  $i++
} while ($i -le 2)

$ErrorActionPreference = $BakErrorActionPreference

throw [System.Exception]::new("Device Not Added. $ret")
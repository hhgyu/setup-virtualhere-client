$client = [System.IO.Pipes.NamedPipeClientStream]::new(".", "vhclient", [System.IO.Pipes.PipeDirection]::InOut)
try {
  $client.Connect(5000)
  if ($client.IsConnected -eq $True) {
    $client.ReadMode = [System.IO.Pipes.PipeTransmissionMode]::Message
    $writer = [System.IO.StreamWriter]::new($client)
    $writer.AutoFlush = $True
    $writer.Write($Args[0].ToCharArray())
    Start-Sleep -Milliseconds 200
    $chars = [System.Collections.Generic.List[char]]::new()
    $reader = [System.IO.StreamReader]::new($client)
    $start = (Get-Date)
    while ($reader.Peek() -ne -1) {
      if ((Get-Date).Subtract($start).TotalMilliseconds -gt 5000) {
        throw [System.TimeoutException]::new("Read Timeout")
      }
      
      $chars.Add($reader.Read())
    }
    
    $ret = [System.Text.Encoding]::UTF8.GetString($chars)
    if ($ret -eq "FAILED" -Or $ret.IndexOf("ERROR:") -eq 0) {
      $errorMsg = "Command failed. [{0}], {1}" -f $Args[0], $ret
      throw [System.Exception]::new($errorMsg)
    }
    else {
      Write-Output $ret
    }
  }
  else {
    throw [System.Exception]::new("Not Connected pipe vhclient")
  }
}
finally {
  if ($client.IsConnected -eq $True) {
    $client.Close()
  }
}
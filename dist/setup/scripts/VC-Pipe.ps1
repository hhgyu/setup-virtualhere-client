function Await-Task {
  param (
      [Parameter(ValueFromPipeline=$true, Mandatory=$true)]
      $task
  )

  process {
      $start = (Get-Date)
      while (-not $task.AsyncWaitHandle.WaitOne(200)) {
        if ((Get-Date).Subtract($start).TotalMilliseconds -gt 5000) {
          throw [System.TimeoutException]::new("Read Timeout")
        }
      }
      $task.GetAwaiter().GetResult()
  }
}
$client = [System.IO.Pipes.NamedPipeClientStream]::new(".", "vhclient", [System.IO.Pipes.PipeDirection]::InOut)
try {
  $client.Connect(5000)
  if ($client.IsConnected -eq $True) {
    $client.ReadMode = [System.IO.Pipes.PipeTransmissionMode]::Message
    $writer = [System.IO.StreamWriter]::new($client)
    $writer.AutoFlush = $True
    $writer.Write($Args[0].ToCharArray())
    Start-Sleep -Milliseconds 200
    
    $reader = [System.IO.StreamReader]::new($client, [System.Text.Encoding]::UTF8)
    
    $chars = [System.Collections.Generic.List[char]]::new()

    $temp = [char[]]::new(512000)
    $task = $reader.ReadAsync($temp, 0, 512000)
    
    $ret = $task | Await-Task
    $task.Dispose()
    if($ret -ne 0) {
      foreach($i in 0..$task.Result){
        $chars.Add($temp[$i])
      }
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

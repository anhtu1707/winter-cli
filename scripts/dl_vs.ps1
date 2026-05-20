$url = 'https://aka.ms/vs/17/release/vs_BuildTools.exe'
$out = 'C:\temp\vs_BuildTools.exe'
New-Item -ItemType Directory -Force -Path 'C:\temp' | Out-Null
Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
Write-Output "Downloaded to $out"

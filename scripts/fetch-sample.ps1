# PowerShell 5.1 / 7+ Cross-compatible script
param (
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Url,

    [Parameter(Position = 1)]
    [string]$OutputPath = "sample_download.html",

    [Parameter(Position = 2)]
    [int]$TimeoutSec = 10
)

$ErrorActionPreference = "Stop"

Write-Host "[FetchSample] Request URL: $Url" -ForegroundColor Cyan
Write-Host "[FetchSample] Timeout: $TimeoutSec sec" -ForegroundColor Cyan

$curlCmd = Get-Command "curl.exe" -ErrorAction SilentlyContinue

if ($curlCmd) {
    Write-Host "[FetchSample] Using Windows curl.exe" -ForegroundColor Gray
    $ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    $accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    $lang = "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"

    & curl.exe -s -L --max-time $TimeoutSec -A $ua -H "Accept: $accept" -H "Accept-Language: $lang" -o $OutputPath $Url
    if ($LASTEXITCODE -eq 0 -and (Test-Path $OutputPath)) {
        $fileSize = (Get-Item $OutputPath).Length
        $fileSizeKb = [math]::Round($fileSize / 1024, 1)
        Write-Host "[FetchSample] Success! Saved to: $OutputPath ($fileSizeKb KB)" -ForegroundColor Green
        exit 0
    } else {
        Write-Error "[FetchSample] curl.exe failed with exit code $LASTEXITCODE"
        exit 1
    }
} else {
    Write-Host "[FetchSample] Using .NET HttpClient" -ForegroundColor Gray
    try {
        Add-Type -AssemblyName System.Net.Http
        $handler = New-Object System.Net.Http.HttpClientHandler
        $handler.AllowAutoRedirect = $true
        $client = New-Object System.Net.Http.HttpClient($handler)
        $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)

        $client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
        $client.DefaultRequestHeaders.Add("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        $client.DefaultRequestHeaders.Add("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")

        $response = $client.GetAsync($Url).GetAwaiter().GetResult()
        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

        [System.IO.File]::WriteAllText($OutputPath, $content, [System.Text.Encoding]::UTF8)
        $fileSize = (Get-Item $OutputPath).Length
        $fileSizeKb = [math]::Round($fileSize / 1024, 1)
        Write-Host "[FetchSample] Success! Saved to: $OutputPath ($fileSizeKb KB, StatusCode: $($response.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Error "[FetchSample] Request failed: $_"
        exit 1
    } finally {
        if ($client) { $client.Dispose() }
    }
}

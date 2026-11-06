# AegisCare Local Development HTTP Server
param(
    [int]$Port = 8080,
    [string]$Root = $PSScriptRoot
)

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".txt"  = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)

try {
    $listener.Start()
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host " AegisCare Local Server running at:" -ForegroundColor Cyan
    Write-Host "   -> http://localhost:$Port/" -ForegroundColor Yellow
    Write-Host " Serving from: $Root" -ForegroundColor Gray
    Write-Host " Press Ctrl+C to stop the server." -ForegroundColor Gray
    Write-Host "=====================================================" -ForegroundColor Green

    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)

        $requestLine = $reader.ReadLine()
        if (-not [string]::IsNullOrEmpty($requestLine)) {
            $parts = $requestLine.Split(" ")
            if ($parts.Length -ge 2) {
                $method = $parts[0]
                $urlPath = $parts[1].Split("?")[0]

                if ($urlPath -eq "/" -or [string]::IsNullOrEmpty($urlPath)) {
                    $urlPath = "/index.html"
                }

                # Sanitize path to prevent directory traversal
                $relPath = $urlPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
                $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $relPath))

                if ($filePath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.File]::Exists($filePath)) {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                    $content = [System.IO.File]::ReadAllBytes($filePath)

                    $headerText = "HTTP/1.1 200 OK`r`n" +
                                  "Content-Type: $contentType`r`n" +
                                  "Content-Length: $($content.Length)`r`n" +
                                  "Connection: close`r`n" +
                                  "Access-Control-Allow-Origin: *`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($headerText)

                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($content, 0, $content.Length)
                    $stream.Flush()
                } else {
                    $notFoundText = "HTTP/1.1 404 Not Found`r`nContent-Length: 13`r`nConnection: close`r`n`r`n404 Not Found"
                    $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes($notFoundText)
                    $stream.Write($notFoundBytes, 0, $notFoundBytes.Length)
                    $stream.Flush()
                }
            }
        }

        $stream.Close()
        $client.Close()
    }
}
finally {
    $listener.Stop()
    Write-Host "Server stopped." -ForegroundColor Yellow
}


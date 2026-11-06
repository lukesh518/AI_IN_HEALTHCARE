# AegisCare Local Development HTTP Server with REST API & CORS
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

$dbPath = [System.IO.Path]::Combine($Root, "data", "database.json")

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)

try {
    $listener.Start()
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host " AegisCare Server with Realtime Common Database API" -ForegroundColor Cyan
    Write-Host "   -> Localhost:  http://localhost:$Port/" -ForegroundColor Yellow
    Write-Host "   -> API DB:     http://localhost:$Port/api/db" -ForegroundColor Cyan
    Write-Host " Serving from: $Root" -ForegroundColor Gray
    Write-Host " Press Ctrl+C to stop the server." -ForegroundColor Gray
    Write-Host "=====================================================" -ForegroundColor Green

    while ($true) {
        $client = $null
        try {
            $client = $listener.AcceptTcpClient()
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)

            $requestLine = $reader.ReadLine()
            if (-not [string]::IsNullOrEmpty($requestLine)) {
                $parts = $requestLine.Split(" ")
                if ($parts.Length -ge 2) {
                    $method = $parts[0].ToUpper()
                    $urlPath = $parts[1].Split("?")[0]

                    # Read HTTP Request Headers
                    $headers = @{}
                    $contentLength = 0
                    while ($true) {
                        $headerLine = $reader.ReadLine()
                        if ([string]::IsNullOrEmpty($headerLine)) { break }
                        $hParts = $headerLine.Split(":", 2)
                        if ($hParts.Length -eq 2) {
                            $hKey = $hParts[0].Trim().ToLower()
                            $hVal = $hParts[1].Trim()
                            $headers[$hKey] = $hVal
                            if ($hKey -eq "content-length") {
                                try { $contentLength = [int]$hVal } catch {}
                            }
                        }
                    }

                    # CORS Preflight
                    if ($method -eq "OPTIONS") {
                        $corsHeaders = "HTTP/1.1 200 OK`r`n" +
                                       "Access-Control-Allow-Origin: *`r`n" +
                                       "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`r`n" +
                                       "Access-Control-Allow-Headers: Content-Type, Authorization`r`n" +
                                       "Content-Length: 0`r`n" +
                                       "Connection: close`r`n`r`n"
                        $corsBytes = [System.Text.Encoding]::UTF8.GetBytes($corsHeaders)
                        $stream.Write($corsBytes, 0, $corsBytes.Length)
                        $stream.Flush()
                    }
                    # REST API: /api/db (Common Database Sync across all portals)
                    elseif ($urlPath -eq "/api/db") {
                        if ($method -eq "GET" -or $method -eq "HEAD") {
                            if ([System.IO.File]::Exists($dbPath)) {
                                $dbBytes = [System.IO.File]::ReadAllBytes($dbPath)
                            } else {
                                $dbBytes = [System.Text.Encoding]::UTF8.GetBytes('{"patients":[],"ambulances":[],"hospitals":[],"cases":[],"completedCases":[],"appointments":[]}')
                            }
                            $respHeaders = "HTTP/1.1 200 OK`r`n" +
                                           "Content-Type: application/json; charset=utf-8`r`n" +
                                           "Content-Length: $($dbBytes.Length)`r`n" +
                                           "Access-Control-Allow-Origin: *`r`n" +
                                           "Connection: close`r`n`r`n"
                            $hBytes = [System.Text.Encoding]::UTF8.GetBytes($respHeaders)
                            $stream.Write($hBytes, 0, $hBytes.Length)
                            if ($method -ne "HEAD") {
                                $stream.Write($dbBytes, 0, $dbBytes.Length)
                            }
                            $stream.Flush()
                        }
                        elseif ($method -eq "POST") {
                            $bodyBytes = New-Object byte[] $contentLength
                            $readCount = 0
                            while ($readCount -lt $contentLength) {
                                $currRead = $stream.Read($bodyBytes, $readCount, $contentLength - $readCount)
                                if ($currRead -le 0) { break }
                                $readCount += $currRead
                            }
                            $bodyStr = [System.Text.Encoding]::UTF8.GetString($bodyBytes, 0, $readCount)
                            
                            # Validate that it is valid JSON before writing
                            $valid = $true
                            try {
                                $null = $bodyStr | ConvertFrom-Json
                            } catch {
                                $valid = $false
                            }

                            if ($valid -and -not [string]::IsNullOrWhiteSpace($bodyStr)) {
                                [System.IO.File]::WriteAllText($dbPath, $bodyStr, [System.Text.Encoding]::UTF8)
                                $respJson = '{"ok":true,"message":"Database updated successfully"}'
                                $statusCode = "200 OK"
                            } else {
                                $respJson = '{"ok":false,"error":"Invalid JSON payload"}'
                                $statusCode = "400 Bad Request"
                            }

                            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
                            $respHeaders = "HTTP/1.1 $statusCode`r`n" +
                                           "Content-Type: application/json; charset=utf-8`r`n" +
                                           "Content-Length: $($respBytes.Length)`r`n" +
                                           "Access-Control-Allow-Origin: *`r`n" +
                                           "Connection: close`r`n`r`n"
                            $hBytes = [System.Text.Encoding]::UTF8.GetBytes($respHeaders)
                            $stream.Write($hBytes, 0, $hBytes.Length)
                            $stream.Write($respBytes, 0, $respBytes.Length)
                            $stream.Flush()
                        }
                    }
                    # Static File Serving
                    else {
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
                            $notFoundText = "HTTP/1.1 404 Not Found`r`nContent-Length: 13`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n404 Not Found"
                            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes($notFoundText)
                            $stream.Write($notFoundBytes, 0, $notFoundBytes.Length)
                            $stream.Flush()
                        }
                    }
                }
            }
        }
        catch {
            # Client disconnected or abort - safely continue to next request
        }
        finally {
            if ($client) {
                try { $client.Close() } catch {}
            }
        }
    }
}
finally {
    $listener.Stop()
    Write-Host "Server stopped." -ForegroundColor Yellow
}

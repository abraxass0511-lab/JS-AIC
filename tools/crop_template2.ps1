Add-Type -AssemblyName System.Drawing
$templateFile = Get-Item "템플릿\*.jpg" | Where-Object { $_.Name -like "*PPT(2)*" } | Select-Object -First 1
Write-Host "Found file: $($templateFile.FullName)"
$bytes = [System.IO.File]::ReadAllBytes($templateFile.FullName)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
Write-Host "Original: $($img.Width)x$($img.Height)"

# Crop the photo region:
# X: 0 to 2200, Y: 700 to 2200
$cropRect = New-Object System.Drawing.Rectangle(0, 700, 2200, 1550)
$bmp = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropRect.Width, $cropRect.Height)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()
$ms.Dispose()

$bmp.Save("tools\crop_template2_photos.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Saved tools\crop_template2_photos.jpg"

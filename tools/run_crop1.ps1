Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("tools\temp_template1.jpg")
Write-Host "Original: $($img.Width)x$($img.Height)"
$cropRect = New-Object System.Drawing.Rectangle(0, 700, 2200, 1550)
$bmp = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropRect.Width, $cropRect.Height)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()
$bmp.Save("tools\crop_template1_photos.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Success cropping 1!"

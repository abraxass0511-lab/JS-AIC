Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("tools\dl_image-1-2.jpeg")
$h = [int]$img.Height
$w = [int]$img.Width
Write-Host "Dim: ${w}x${h}"
$cropRect = New-Object System.Drawing.Rectangle(0, ($h - 120), $w, 120)
$bmp = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropRect.Width, $cropRect.Height)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()
$bmp.Save("tools\dl_image2_bottom_check.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Saved tools\dl_image2_bottom_check.jpg"

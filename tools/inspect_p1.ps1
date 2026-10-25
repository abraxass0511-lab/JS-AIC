Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("tools\temp_template1.jpg")
Write-Host "Original: $($img.Width)x$($img.Height)"
# Photo 1 is on the left: X around 200 to 1100, Y from 1250 to 2100
$cropRect = New-Object System.Drawing.Rectangle(150, 1250, 1000, 850)
$bmp = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropRect.Width, $cropRect.Height)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()
$bmp.Save("tools\inspect_photo1_bottom.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Saved inspect_photo1_bottom.jpg"

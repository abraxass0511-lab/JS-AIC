Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("tools\temp_template1.jpg")
Write-Host "Original: $($img.Width)x$($img.Height)"
# In original slide:
# sx: 192, sw: 1808.
# p2X: 192 + 1808*0.530 = 1150
# p2W: 1808*0.465 = 840
# p2Y: 991 + 845*0.355 = 1291
# p2H in code was: 845*0.640 = 541 -> so bottom was 1291 + 541 = 1832!
# Let's crop from Y=1291 to Y=2100 (height 800) to see where the actual bottom is!
$cropRect = New-Object System.Drawing.Rectangle(1050, 1250, 1000, 850)
$bmp = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropRect.Width, $cropRect.Height)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()
$bmp.Save("tools\inspect_photo2_bottom.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Saved inspect_photo2_bottom.jpg"

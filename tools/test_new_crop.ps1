Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("tools\temp_template1.jpg")
$W = $img.Width
$H = $img.Height
Write-Host "Slide: $($W)x$($H)"

# New coordinates:
$sx = [int][Math]::Max(0, [Math]::Round($W * 0.048))
$sy = [int][Math]::Max(0, [Math]::Round($H * 0.440))
$sw = [int][Math]::Min($W - $sx, [Math]::Round($W * 0.452))
$sh = [int][Math]::Min($H - $sy, [Math]::Round($H * 0.445))

Write-Host "sx=$sx sy=$sy sw=$sw sh=$sh (bottom Y=$($sy + $sh))"

# Photo 1 (Left: 수평양중 A=B)
$p1W = [int][Math]::Round($sw * 0.525)
$p1H = [int]$sh
$bmp1 = New-Object System.Drawing.Bitmap($p1W, $p1H)
$g1 = [System.Drawing.Graphics]::FromImage($bmp1)
$g1.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $p1W, $p1H)), (New-Object System.Drawing.Rectangle($sx, $sy, $p1W, $p1H)), [System.Drawing.GraphicsUnit]::Pixel)
$g1.Dispose()
$bmp1.Save("tools\new_photo1.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp1.Dispose()
Write-Host "Saved new_photo1.jpg"

# Photo 2 (Right: 슬링 디테일 A, B)
$p2X = [int]($sx + [Math]::Round($sw * 0.530))
$p2Y = [int]($sy + [Math]::Round($sh * 0.310))
$p2W = [int][Math]::Round($sw * 0.465)
$p2H = [int][Math]::Round($sh * 0.690)
$bmp2 = New-Object System.Drawing.Bitmap($p2W, $p2H)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $p2W, $p2H)), (New-Object System.Drawing.Rectangle($p2X, $p2Y, $p2W, $p2H)), [System.Drawing.GraphicsUnit]::Pixel)
$g2.Dispose()
$bmp2.Save("tools\new_photo2.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp2.Dispose()
Write-Host "Saved new_photo2.jpg"

$img.Dispose()

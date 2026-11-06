
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("tools\\temp_template1.jpg")
$W = $img.Width
$H = $img.Height

$cropX = [int][Math]::Round($W * 0.04)
$cropY = [int][Math]::Round($H * 0.28)
$cropW = [int][Math]::Round($W * 0.60)
$cropH = [int][Math]::Round($H * 0.18)

$bmp = New-Object System.Drawing.Bitmap($cropW, $cropH)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)), (New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$bmp.Save("tools\\crop_header_area.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
$img.Dispose()
Write-Host "Success cropped header area!"

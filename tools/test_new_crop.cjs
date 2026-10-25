const fs = require('fs');

// Let's test the new crop coordinates on temp_template1.jpg (4000x2252)
// W = 4000, H = 2252
const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("tools\\\\temp_template1.jpg")
$W = $img.Width
$H = $img.Height
Write-Host "Slide: ${W}x${H}"

# New coordinates:
$sx = [Math]::Max(0, [Math]::Round($W * 0.048))
$sy = [Math]::Max(0, [Math]::Round($H * 0.440))
$sw = [Math]::Min($W - $sx, [Math]::Round($W * 0.452))
# Previously: sh = H * 0.375 = 845 -> sy + sh = 1835 (cut off!)
# New: sh = H * 0.445 = 1002 -> sy + sh = 1993 (captures everything!)
$sh = [Math]::Min($H - $sy, [Math]::Round($H * 0.445))

Write-Host "sx=$sx sy=$sy sw=$sw sh=$sh (bottom Y=$($sy + $sh))"

# Photo 1 (Left: 수평양중 A=B)
$p1W = [Math]::Round($sw * 0.525)
$p1H = $sh
$bmp1 = New-Object System.Drawing.Bitmap($p1W, $p1H)
$g1 = [System.Drawing.Graphics]::FromImage($bmp1)
$g1.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $p1W, $p1H)), (New-Object System.Drawing.Rectangle($sx, $sy, $p1W, $p1H)), [System.Drawing.GraphicsUnit]::Pixel)
$g1.Dispose()
$bmp1.Save("tools\\\\new_photo1.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp1.Dispose()
Write-Host "Saved new_photo1.jpg"

# Photo 2 (Right: 슬링 디테일 A, B)
$p2X = $sx + [Math]::Round($sw * 0.530)
$p2Y = $sy + [Math]::Round($sh * 0.310)
$p2W = [Math]::Round($sw * 0.465)
$p2H = [Math]::Round($sh * 0.690)
$bmp2 = New-Object System.Drawing.Bitmap($p2W, $p2H)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $p2W, $p2H)), (New-Object System.Drawing.Rectangle($p2X, $p2Y, $p2W, $p2H)), [System.Drawing.GraphicsUnit]::Pixel)
$g2.Dispose()
$bmp2.Save("tools\\\\new_photo2.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp2.Dispose()
Write-Host "Saved new_photo2.jpg"

$img.Dispose()
`;
fs.writeFileSync('tools/test_new_crop.ps1', ps);
const { execSync } = require('child_process');
console.log(execSync('powershell -ExecutionPolicy Bypass -File tools/test_new_crop.ps1').toString());

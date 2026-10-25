Add-Type -AssemblyName System.Drawing
$src = "C:\Users\YS\.gemini\antigravity-ide\brain\78b41e28-8f02-42db-a913-5114ee98c49d\.user_uploaded\media_1792903220821.jpg"
$img = [System.Drawing.Image]::FromFile($src)
$img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
$img.Save("tools\original_phone_rightup.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$img.Dispose()
Write-Host "Done rotated 270"

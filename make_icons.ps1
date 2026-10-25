Add-Type -AssemblyName System.Drawing

function Create-AppIcon {
    param(
        [int]$size,
        [string]$outputPath
    )
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Background
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(8, 11, 16))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)

    # Cyan Outer Ring
    $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(0, 229, 255), ($size * 0.05))
    $inset = $size * 0.08
    $g.DrawEllipse($ringPen, $inset, $inset, ($size - 2 * $inset), ($size - 2 * $inset))

    # Text
    $font = New-Object System.Drawing.Font("Arial", ($size * 0.22), [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString("APEX", $font, $textBrush, $rect, $format)

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$dir = "C:\Users\Lee\.gemini\antigravity-ide\scratch\engine-simulator-mobile\icons"
Create-AppIcon -size 192 -outputPath "$dir\icon-192.png"
Create-AppIcon -size 512 -outputPath "$dir\icon-512.png"
Write-Host "Icons generated successfully"

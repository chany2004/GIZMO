Add-Type -AssemblyName System.Drawing

function New-QuesterIcon {
    param(
        [int]$Size,
        [string]$OutputPath,
        [bool]$Maskable = $false
    )

    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $bounds = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
    $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $bounds,
        [System.Drawing.ColorTranslator]::FromHtml("#111833"),
        [System.Drawing.ColorTranslator]::FromHtml("#6757D9"),
        45
    )
    $graphics.FillRectangle($background, $bounds)

    $padding = if ($Maskable) { [int]($Size * 0.20) } else { [int]($Size * 0.12) }
    $circleSize = $Size - (2 * $padding)
    $circleBounds = [System.Drawing.RectangleF]::new($padding, $padding, $circleSize, $circleSize)
    $circleBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml("#FFF9EC")
    )
    $graphics.FillEllipse($circleBrush, $circleBounds)

    $fontSize = if ($Maskable) { $Size * 0.39 } else { $Size * 0.48 }
    $font = [System.Drawing.Font]::new(
        "Arial",
        $fontSize,
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel
    )
    $letterBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml("#6757D9")
    )
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString("Q", $font, $letterBrush, $circleBounds, $format)

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $format.Dispose()
    $letterBrush.Dispose()
    $font.Dispose()
    $circleBrush.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

$assetsDirectory = Join-Path $PSScriptRoot "..\assets"
New-QuesterIcon -Size 192 -OutputPath (Join-Path $assetsDirectory "icon-192.png")
New-QuesterIcon -Size 512 -OutputPath (Join-Path $assetsDirectory "icon-512.png")
New-QuesterIcon -Size 512 -OutputPath (Join-Path $assetsDirectory "icon-maskable-512.png") -Maskable $true

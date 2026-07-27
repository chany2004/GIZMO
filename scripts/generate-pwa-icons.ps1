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
    $background = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml("#FFFAF1")
    )
    $graphics.FillRectangle($background, $bounds)

    # Match the site's .brand-mark: navy rounded tile, yellow Q, slight rotation.
    $tileSize = if ($Maskable) { $Size * 0.56 } else { $Size * 0.68 }
    $tileLeft = ($Size - $tileSize) / 2
    $tileTop = ($Size - $tileSize) / 2
    $tileRadius = $tileSize * 0.28
    $tileBounds = [System.Drawing.RectangleF]::new($tileLeft, $tileTop, $tileSize, $tileSize)
    $tilePath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $tileRadius * 2
    $tilePath.AddArc($tileBounds.Left, $tileBounds.Top, $diameter, $diameter, 180, 90)
    $tilePath.AddArc($tileBounds.Right - $diameter, $tileBounds.Top, $diameter, $diameter, 270, 90)
    $tilePath.AddArc($tileBounds.Right - $diameter, $tileBounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $tilePath.AddArc($tileBounds.Left, $tileBounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $tilePath.CloseFigure()

    $graphics.TranslateTransform($Size / 2, $Size / 2)
    $graphics.RotateTransform(-8)
    $graphics.TranslateTransform(-$Size / 2, -$Size / 2)
    $tileBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml("#121936")
    )
    $graphics.FillPath($tileBrush, $tilePath)

    $fontSize = if ($Maskable) { $Size * 0.36 } else { $Size * 0.44 }
    $font = [System.Drawing.Font]::new(
        "Arial",
        $fontSize,
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel
    )
    $letterBrush = [System.Drawing.SolidBrush]::new(
        [System.Drawing.ColorTranslator]::FromHtml("#FFD84D")
    )
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString("Q", $font, $letterBrush, $tileBounds, $format)

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $format.Dispose()
    $letterBrush.Dispose()
    $font.Dispose()
    $tileBrush.Dispose()
    $tilePath.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

$assetsDirectory = Join-Path $PSScriptRoot "..\assets"
New-QuesterIcon -Size 192 -OutputPath (Join-Path $assetsDirectory "icon-192.png")
New-QuesterIcon -Size 512 -OutputPath (Join-Path $assetsDirectory "icon-512.png")
New-QuesterIcon -Size 512 -OutputPath (Join-Path $assetsDirectory "icon-maskable-512.png") -Maskable $true

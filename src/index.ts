import { Plugin } from 'vite'
import { webfont } from 'webfont'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface WebfontIconsOptions {
    files: string[]
    fontName: string
    templateClassName: string
    formats: Array<'svg' | 'ttf' | 'woff' | 'woff2' | 'eot'>
    fontPath: string
    selector: string
}

const VIRTUAL_MODULE_ID = 'icons.css'
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`

function getOptions(options: Partial<WebfontIconsOptions>): WebfontIconsOptions {
    return {
        files: options.files ?? ['icons/**/*.svg'],
        fontName: options.fontName ?? 'AppIcons',
        fontPath: options.fontPath ?? 'fonts',
        formats: options.formats ?? ['svg', 'ttf', 'woff', 'woff2', 'eot'],
        selector: options.selector ?? '.icon',
        templateClassName: options.templateClassName ?? 'icon',
    }
}

function UnicodeToCss(unicode: string) {
    return `\\${unicode.charCodeAt(0).toString(16)}`
}

const mimeTypes = {
    eot: 'application/vnd.ms-fontobject',
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    svg: 'image/svg+xml',
}

export default function IconFontPlugin(config: Partial<WebfontIconsOptions>): Plugin {
    const files: Record<string, any> = {}
    const options = getOptions(config ?? {})

    let isBuild = false


    function generateCss(
        options: WebfontIconsOptions,
        files: Record<string, {
            url: string,
            mime: string,
            data: string | Buffer,
        }>,
        glyphdata: any[],
    ) {
        let code = `
    @font-face {
        font-family: "${options.fontName}";
        src: url("${files.eot.url}");
        src: url("${files.eot.url}?#iefix") format("embedded-opentype"),
            url("${files.woff2.url}") format("woff2"),
            url("${files.woff.url}") format("woff"),
            url("${files.ttf.url}") format("truetype"),
            url("${files.svg.url}#${options.fontName}") format("svg");
        font-weight: normal;
        font-style: normal;
    }

    ${options.selector ?? '.icon'} {
        display: inline-block;
        font-family: "${options.fontName}";
        font-style: normal;
        font-weight: normal;
        font-variant: normal;
        line-height: 1;
        text-transform: none;
        text-rendering: auto;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
    `

        for (const glyph of glyphdata) {
            code += `${options.selector}-${glyph.metadata.name}::before { content: '${UnicodeToCss(glyph.metadata.unicode[0])}';}\n`
        }


        return code
    }

    return {
        name: 'webfont-icons',
        enforce: 'pre',
        configResolved(config) {
            isBuild = config.command === 'build'
        },
        resolveId(source) {
            if (source === VIRTUAL_MODULE_ID) {
                return VIRTUAL_MODULE_ID
            }
        },

        async load(id) {
            if (id === VIRTUAL_MODULE_ID) {
                return RESOLVED_VIRTUAL_MODULE_ID;
            }
        },
        async transform(code, id) {
            if (code !== RESOLVED_VIRTUAL_MODULE_ID) {
                return
            }

            const result = await webfont({
                files: options.files,
                fontName: options.fontName,
                formats: options.formats,
                sort: true,
            })

            result.config?.formats?.forEach(format => {
                if (!result[format]) return

                const fileName = `assets/${options.fontPath}/${options.fontName}.${format}`

                if (isBuild) {
                    const ref = this.emitFile({
                        type: 'asset',
                        fileName,
                        source: result[format],
                    })

                    files[format] = {
                        url: `${options.fontPath}/${options.fontName}.${format}`,
                        mime: mimeTypes[format],
                        data: result[format],
                    }
                } else {
                    files[format] = {
                        url: fileName,
                        mime: mimeTypes[format],
                        data: result[format],
                    }
                }
            })

            return {
                code: generateCss(options as WebfontIconsOptions, files, result.glyphsData!),
            }
        },
        configureServer(server) {
            console.log(files);

            for (const format of options.formats) {

                server.middlewares.use(`/assets/${options.fontPath}/${options.fontName}.${format}`, (req, res) => {
                    const asset = files[format]
                    if (!asset) {
                        res.statusCode = 404
                        res.end()
                        return
                    }

                    res.setHeader('Content-Type', asset.mime)
                    res.statusCode = 200
                    res.end(asset.data)
                })
            }
        },
    }
}
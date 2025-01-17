const fs = require("fs")
const process = require("process")
const path = require("path")
const cp = require("child_process")
const markdownIt = require("markdown-it")
const mdAnchor = require("markdown-it-anchor")
const mdEmojis = require("markdown-it-emoji")
const mdSmall = require("markdown-it-small")

const customIcons = require("./custom-icons.js")

const args = process.argv.slice(2)

const DIST_FOLDER = path.join(process.cwd(), "dist")
const LIST_FOLDER = path.resolve(args[0] || "./docs/index.md")
const HTML_TEMPLATE = path.join(process.cwd(), "./src/index.html")
const CSS_FILE = path.join(process.cwd(), "./src/style.css")
const ICONS_FOLDER = path.join(process.cwd(), "./assets/icons")
const HTML_REPLACE_TAGS = {
    MD_REPLACE: "<!-- PREPROCESSOR-MD-DISPLAY-REPLACE -->",
    MD_ANCHORS: "<!-- PREPROCESSOR-MD-ANCHORS-REPLACE -->",
    MD_ANCHORS_FIRST: "<!-- PREPROCESSOR-MD-ANCHORS-FIRST-REPLACE -->",
    COMMIT_INFO: "<!-- PREPROCESSOR-COMMIT-INFO-REPLACE -->",
}

const main = async () => {

    console.log({
        DIST_FOLDER,
        LIST_FOLDER
    })

    await ensureDistFolder()

    const mdContents = await fs.promises.readFile(LIST_FOLDER, { encoding: 'utf8' })
    console.log(`successfully read ${path.relative(process.cwd(), LIST_FOLDER)} (${utils.blobSize(mdContents)} bytes)`)


    console.log("reading emoji contents")
    const emojis = await customIcons()
    console.log("processing html contents")
    const processedContent = mdProcessor(mdContents, emojis)
    const processedHtml = processedContent.output
    console.log(`successfully converted list to HTML (${utils.blobSize(processedHtml)} bytes)`)
    
    console.log(`reading html template (${path.relative(process.cwd(), HTML_TEMPLATE)})`)
    const templateHtml = await fs.promises.readFile(HTML_TEMPLATE, { encoding: 'utf8' })
    console.log("injecting generated content")
    let htmlOutput = templateHtml.replace(HTML_REPLACE_TAGS.MD_REPLACE, processedHtml)

    console.log("injecting sidebar anchors")
    htmlOutput = htmlOutput.replace(HTML_REPLACE_TAGS.MD_ANCHORS, processedContent.anchors.map(anchorInfo => {
        return `<a href="#${anchorInfo.slug}" class="toc-content ${anchorInfo.tag}">${anchorInfo.title}</a>`
    }).join(""))
    console.log("injecting other anchors")
    htmlOutput = htmlOutput.replace(HTML_REPLACE_TAGS.MD_ANCHORS_FIRST, "#" + processedContent.anchors[0].slug)
    console.log("injecting commit hash info")
    const websiteCommit = await utils.getCommitHash(process.cwd()).catch(() => undefined)
    const listCommit = await utils.getCommitHash(path.dirname(LIST_FOLDER)).catch(() => undefined)
    htmlOutput = htmlOutput.replace(HTML_REPLACE_TAGS.COMMIT_INFO, `Website running commit ${websiteCommit.slice(0, 7)} using list from commit ${listCommit.slice(0, 7)}`)

    console.log("saving changes")
    const outputHtmlFile = path.join(DIST_FOLDER, "./index.html")
    await fs.promises.writeFile(outputHtmlFile, htmlOutput)
    console.log(`wrote output HTML file to ${outputHtmlFile}`)

    const outputStylesPath = path.join(process.cwd(), "./dist/style.css")
    console.log(`copying stylesheet to ${path.relative(process.cwd(), outputStylesPath)}`)
    await fs.promises.copyFile(CSS_FILE, outputStylesPath)
    console.log(`copied stylesheet`)

    const outputIconsPath = path.join(process.cwd(), "./dist/icons")
    console.log(`copying icons to ${path.relative(process.cwd(), outputIconsPath)}`)
    await fs.promises.cp(ICONS_FOLDER, outputIconsPath, {recursive: true})
    console.log(`copied stylesheet`)
}

const ensureDistFolder = async () => {
    const relativePath = path.relative(process.cwd(), DIST_FOLDER)
    try {
        await fs.promises.access(DIST_FOLDER);
        console.log(`output "${relativePath}" folder exists`);
    } catch (e) {
        console.log(`${relativePath} folder doesn't exist, creating`)
        await fs.promises.mkdir(DIST_FOLDER, { recursive: true})
    }
}

const mdProcessor = (content, emojis) => {
    let anchors = []
    const md = markdownIt({
        html: true
    })
    .use(mdAnchor, {
        callback: (token, info) => {
            if(!(token.tag === "h1" || token.tag === "h2")) return
            anchors.push({
                slug: info.slug,
                title: info.title,
                tag: token.tag
            })
        }
    })
    .use(mdEmojis.full, {defs: emojis})
    .use(mdSmall)

    // add open in new tab functionality
    const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
    };  
    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
        const token = tokens[idx]
        if(!token.attrGet("href")?.startsWith("#")) token.attrSet('target', '_blank');
        return defaultRender(tokens, idx, options, env, self);
    };

    return {
        output: md.render(content),
        anchors
    }
}

const utils = {
    blobSize: str => new Blob([str]).size,
    getCommitHash: (path) => {
        return new Promise((resolve, reject) => {
            cp.exec('git rev-parse HEAD', {cwd: path}, (err, stdout) => {
                if(err) return reject(err)
                resolve(stdout)
            }); 
        })
      }
      
}

main()
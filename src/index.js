const defaultTemplate = `Paper::
Link:: {{absUrl}}
Status:: #To-Read
Tags:: Paper
Date:: [[{{today}}]]
Type:: Paper
Authors:: {{#each authors}}[[{{this}}]]{{#unless @last}}, {{/unless}}{{/each}}
`.trim()

function isValidArxivUrl (url) {
    // Define the regular expressions for the two valid formats
    const absPattern = /^https:\/\/arxiv\.org\/abs\/[a-zA-Z0-9.]+$/;
    const pdfPattern = /^https:\/\/arxiv\.org\/pdf\/[a-zA-Z0-9.]+\.pdf$/;
    // Test the URL against the regular expressions
    return absPattern.test(url) || pdfPattern.test(url);
}

async function extractPaperMetadata (url) {
    // Check if the URL starts with the expected prefix for abs URLs
    const absPrefix = 'https://arxiv.org/abs/';
    const pdfPrefix = 'https://arxiv.org/pdf/';

    
    const absUrl = url.replace(".pdf", "").replace(pdfPrefix, absPrefix)
    const pdfUrl = url.replace(".pdf", "").replace(absPrefix, pdfPrefix) + ".pdf"
    const paperId = absUrl.substring(absPrefix.length);

    // Extract paper metadata
    const apiUrl = `https://export.arxiv.org/api/query?id_list=${paperId}`;
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.text();
        // Here, you would parse the XML response to extract metadata
        // This is a simplified example and assumes a known structure
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data, "application/xml");
        const entry = xmlDoc.querySelector("entry");
        const date = new Date();
        const userConfigs = await logseq.App.getUserConfigs();
        const dateFormat = userConfigs.preferredDateFormat;
        const today = moment(date).format(dateFormat);
        if (entry) {
          const title = entry.querySelector("title").textContent.replace(/\n/g, ' ').replace(/\s+/g, ' ');
          const summary = entry.querySelector("summary").textContent.replace(/\n/g, ' ').replace(/\s+/g, ' ');
          const authors = Array.from(entry.querySelectorAll("author > name")).map(author => author.textContent);
          const fileName = await downloadPaper(pdfUrl);
          const filePath = "../assets/" + fileName;
          return { paperId, title, summary, authors, absUrl, today,  fileName, filePath};
        }
        return null;
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

function createPaperBlocks (paperMetadata) {
    const template = Handlebars.compile(logseq.settings.arxivMateTemplate.trim());
    return template(paperMetadata).split("\n\n")
}

async function createPaperPage (url) {
    const paperMetadata = await extractPaperMetadata(url);
    const paperBlocks = createPaperBlocks(paperMetadata);
    const newPage = await logseq.Editor.createPage(paperMetadata.title, {}, {
        createFirstBlock: false,
    });

     
    for (const block of paperBlocks) {
        await logseq.Editor.insertBlock(newPage.originalName, block.trim(), {
            sibling: false, // This ensures the blocks are added as children of the last block
        });
    }

    return newPage;
}

async function downloadPaper (url) {
    const urlParts = url.split("/");
    const fileName = urlParts[urlParts.length - 1];
    // Fetch the PDF file
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "blob"
    xhr.onload = () => {
        // Create a new Blob object with the response data
        var blob = new Blob([xhr.response], { type: 'application/pdf' });

        // Create a temporary anchor element
        var a = document.createElement('a');

        // Set the href attribute of the anchor element to the object URL of the blob
        a.href = window.URL.createObjectURL(blob);

        // Set the download attribute to specify the filename
        a.download = fileName;

        // Programmatically click the anchor element to trigger the download
        a.click();

        // Cleanup: remove the anchor element and revoke the object URL to free up memory
        window.URL.revokeObjectURL(a.href);
    };
        
    xhr.send();
    return fileName
}



async function main () {
    logseq.useSettingsSchema([
        {
            key: "arxivMateTemplate",
            type: "string",
            title: "Template",
            description: "Template to be used for page creation, you can use the following tags `{{paperId}}`, `{{title}}`, `{{summary}}`, `{{authors}}`, `{{absUrl}}` and `{{today}}`. Multiple blocks are splitted by `\\n`.",
            inputAs: "textarea",
            default: defaultTemplate
        },
    ])
    logseq.Editor.registerSlashCommand(
      'Get Arxiv Paper',
      async () => {
        const { content, uuid } = await logseq.Editor.getCurrentBlock();
        
        if (!isValidArxivUrl(content.trim())) {
            logseq.UI.showMsg(`
                Link not supported!
                ${content}
            `.trim(), "error");
        } else {
            const newPage = await createPaperPage(content.trim());
            logseq.Editor.updateBlock(uuid, `[[${newPage.originalName}]]`)
        }     
      },
    )
  }
  
  // bootstrap
  logseq.ready(main).catch(console.error)
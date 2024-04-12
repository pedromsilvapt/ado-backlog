const { mdToPdf } = require('md-to-pdf');

export class PDFFormat {
    public constructor () {

    }

    public async run(inputFolder: string, outputFolder: string) {
        await mdToPdf({
            path: inputFolder + '/**/*.md',
            dest: outputFolder + '/file.pdf'
        });
    }
}

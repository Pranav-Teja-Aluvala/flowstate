"""Generate synthetic, valid office files for the real-engine smoke test only."""
from pathlib import Path
from docx import Document
from pptx import Presentation
from openpyxl import Workbook
from reportlab.pdfgen.canvas import Canvas

output = Path('.local/office-fixtures')
output.mkdir(parents=True, exist_ok=True)
document = Document()
document.add_heading('FLOWSTATE Office fixture', level=1)
document.add_paragraph('Synthetic content for collaboration verification. No customer data.')
document.save(output / 'brief.docx')
slides = Presentation()
slide = slides.slides.add_slide(slides.slide_layouts[1])
slide.shapes.title.text = 'FLOWSTATE presentation fixture'
slide.placeholders[1].text = 'Synthetic content. No customer data.'
slides.save(output / 'slides.pptx')
workbook = Workbook()
workbook.active['A1'] = 'FLOWSTATE spreadsheet fixture'
workbook.active['B1'] = 42
workbook.save(output / 'sheet.xlsx')
pdf = Canvas(str(output / 'brief.pdf'))
pdf.drawString(60, 760, 'FLOWSTATE PDF fixture. Synthetic content. No customer data.')
pdf.save()
print('Generated four synthetic Office fixtures.')

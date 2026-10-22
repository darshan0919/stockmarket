#!/usr/bin/env python3
"""
documentExtractors.py — fast, standard-library and openpyxl-based extractors for
DOCX, PPTX, and XLSX files to Markdown and JSON formats.
"""

import sys
import os
import json
import zipfile
import xml.etree.ElementTree as ET

def extract_docx(file_path):
    """Extract paragraphs and tables from a .docx file into Markdown."""
    paragraphs = []
    try:
        with zipfile.ZipFile(file_path) as z:
            if "word/document.xml" not in z.namelist():
                return {"error": "word/document.xml not found in docx"}
            xml_content = z.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            
            # XML namespaces for wordprocessingML
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            
            for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                texts = [node.text for node in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text]
                if texts:
                    line = "".join(texts).strip()
                    if line:
                        paragraphs.append(line)
        
        md_text = "\n\n".join(paragraphs)
        return {
            "format": "markdown",
            "text": md_text,
            "chars": len(md_text),
            "paragraphs": len(paragraphs)
        }
    except Exception as e:
        return {"error": str(e)}

def extract_pptx(file_path):
    """Extract slides from a .pptx file into Markdown."""
    slides_data = []
    try:
        with zipfile.ZipFile(file_path) as z:
            slide_files = sorted(
                [f for f in z.namelist() if f.startswith("ppt/slides/slide") and f.endswith(".xml")],
                key=lambda x: int("".join(filter(str.isdigit, os.path.basename(x))) or "0")
            )
            
            for idx, slide_file in enumerate(slide_files, start=1):
                tree = ET.fromstring(z.read(slide_file))
                texts = []
                for node in tree.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}t'):
                    if node.text and node.text.strip():
                        texts.append(node.text.strip())
                
                title = texts[0] if texts else f"Slide {idx}"
                body = texts[1:] if len(texts) > 1 else []
                slides_data.append({
                    "slide": idx,
                    "title": title,
                    "content": body
                })
        
        # Build markdown representation
        md_lines = []
        for s in slides_data:
            md_lines.append(f"## Slide {s['slide']}: {s['title']}\n")
            for item in s['content']:
                md_lines.append(f"- {item}")
            md_lines.append("\n---\n")
            
        md_text = "\n".join(md_lines)
        return {
            "format": "markdown",
            "text": md_text,
            "chars": len(md_text),
            "slides": slides_data
        }
    except Exception as e:
        return {"error": str(e)}

def extract_xlsx(file_path):
    """Extract worksheets and rows from an .xlsx file into JSON and Markdown."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(file_path, data_only=True)
        sheets_data = {}
        md_sections = []
        
        for name in wb.sheetnames:
            ws = wb[name]
            rows = []
            for row in ws.iter_rows(values_only=True):
                # Filter out completely empty rows
                if any(v is not None and str(v).strip() != "" for v in row):
                    cleaned_row = [str(c).strip() if c is not None else "" for c in row]
                    rows.append(cleaned_row)
            
            sheets_data[name] = rows
            
            # Format sheet into markdown table if rows exist
            if rows:
                md_sections.append(f"### Sheet: {name}\n")
                header = rows[0]
                md_sections.append("| " + " | ".join(header) + " |")
                md_sections.append("| " + " | ".join(["---"] * len(header)) + " |")
                for r in rows[1:100]: # Cap table at 100 rows in MD for sanity
                    padded = r + [""] * (len(header) - len(r))
                    md_sections.append("| " + " | ".join(padded[:len(header)]) + " |")
                if len(rows) > 100:
                    md_sections.append(f"\n*(Truncated in MD view: {len(rows) - 100} more rows)*\n")
                md_sections.append("\n")
                
        md_text = "\n".join(md_sections)
        return {
            "format": "sheets_json_and_markdown",
            "sheet_names": wb.sheetnames,
            "sheets": sheets_data,
            "text": md_text,
            "chars": len(md_text)
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python documentExtractors.py <docx|pptx|xlsx> <file_path>")
        sys.exit(1)
        
    ext_type = sys.argv[1].lower()
    path = sys.argv[2]
    
    if ext_type == "docx":
        res = extract_docx(path)
    elif ext_type == "pptx":
        res = extract_pptx(path)
    elif ext_type == "xlsx":
        res = extract_xlsx(path)
    else:
        res = {"error": f"Unknown file type: {ext_type}"}
        
    print(json.dumps(res))

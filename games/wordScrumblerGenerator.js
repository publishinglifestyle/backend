"use client";

import React, { useState } from "react";
import { Button } from '@nextui-org/button';
import { scrambleWords } from '@/managers/gamesManager';
import jsPDF from 'jspdf';

interface ScrambleWordsProps {
    words?: string[];
    font?: string;
    custom_name?: string;
    custom_solution_name?: string;
}

interface ScrambledWord {
    scrambledWord: string;
    originalWord: string;
}

export default function ScrambleWords({ words, font, custom_name, custom_solution_name }: ScrambleWordsProps) {
    const [scrambledWords, setScrambledWords] = useState < ScrambledWord[] | null > (null);
    const [isGenerating, setIsGenerating] = useState < boolean > (false);

    const cleanWords = (words: string[]) => {
        return words.map(word => word.trim().replace(/['"]+/g, ''));
    };

    const handleGenerateScrambledWords = async () => {
        setIsGenerating(true);
        const cleanedWords = cleanWords(words || []);
        const scrambledWordsResponse = await scrambleWords(cleanedWords);
        setScrambledWords(scrambledWordsResponse);

        if (scrambledWordsResponse) {
            generatePDF(scrambledWordsResponse);
            setIsGenerating(false);
        }
    };

    const addContentToPDF = (doc: jsPDF, content: ScrambledWord[], startY: number, isSolution: boolean = false) => {
        const margin = 20; // Set margin for the content
        const columnWidth = 80; // Width of each column
        const equalSignWidth = 10; // Width for the '=' sign space
        const blankLineWidth = 40; // Width for the blank line or solution
        const lineHeight = 8; // Line height for text
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const maxLinesPerColumn = Math.floor((pageHeight - startY - margin) / lineHeight);

        let x = margin; // Initial x position for the first column
        let y = startY; // Initial y position
        let columnCount = 0; // Column count to keep track of how many columns have been filled

        doc.setFontSize(10); // Set a smaller font size for fitting more text

        content.forEach((wordInfo, index) => {
            const scrambledWord = wordInfo.scrambledWord;
            const originalWord = wordInfo.originalWord;

            const wordX = x;
            const equalX = wordX + columnWidth;
            const blankX = equalX + equalSignWidth;

            doc.setFont(font || "times", "normal");
            doc.text(scrambledWord, wordX, y);
            doc.text('=', equalX, y);

            if (isSolution) {
                doc.text(originalWord, blankX, y);
            } else {
                doc.text('_ _ _ _ _ _ _ _', blankX, y);
            }

            y += lineHeight;

            // Check if we've reached the maximum number of lines for the current column
            if ((index + 1) % maxLinesPerColumn === 0) {
                columnCount += 1;
                if (columnCount < 2) { // Only allow up to 2 columns per page
                    x = margin + columnWidth + equalSignWidth + blankLineWidth; // Move to the second column position
                    y = startY; // Reset y position to the start for the new column
                } else if (index + 1 < content.length) {
                    // If we have more content to display, start a new page
                    doc.addPage();
                    x = margin; // Reset x position for the new page
                    y = startY; // Reset y position for the new page
                    columnCount = 0; // Reset column count for the new page
                }
            }
        });

        return y;
    };

    const generatePDF = (scrambledWords: ScrambledWord[]) => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const margin = 20; // Margin for top and bottom
        doc.setFont(font || "times", "italic");
        doc.setFontSize(14);

        doc.setFont(font || "times", "normal");
        doc.setFontSize(16); // Title font size
        doc.text(custom_name || 'Scrambled Words Game', 105, margin - 10, { align: 'center' });
        doc.setFont(font || "times", "italic");
        doc.setFontSize(10); // Reduced font size for content

        const startY = margin;

        const gameContent = scrambledWords.map(wordInfo => ({
            scrambledWord: wordInfo.scrambledWord,
            originalWord: wordInfo.originalWord
        }));

        addContentToPDF(doc, gameContent, startY);

        doc.addPage();
        doc.setFont(font || "times", "normal");
        doc.setFontSize(16);
        doc.text(custom_solution_name || 'Scrambled Words Solutions', 105, margin - 10, { align: 'center' });
        doc.setFont(font || "times", "italic");
        doc.setFontSize(10);

        addContentToPDF(doc, gameContent, startY, true);

        const pdfDataUrl = doc.output('bloburl');
        window.open(pdfDataUrl, '_blank');
    };

    return (
        <div style={{ textAlign: 'center' }}>
            <Button
                isDisabled={!words || words[0] == '' || isGenerating}
                color="secondary"
                onClick={handleGenerateScrambledWords}
            >
                {isGenerating ? "Generating..." : "Generate PDF"}
            </Button>
        </div>
    );
}

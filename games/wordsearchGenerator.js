const WordSearch = require("@blex41/word-search");
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

// Function to generate missing words using AI if needed
async function generateMissingWords(words, additionalCount) {
    const wordsString = words.join(',');

    const context = [
        {
            role: 'system',
            content: `You are a word generator for a word search puzzle. 
                      Given a list of words, your job is to ensure that the number of words can be evenly distributed across a specified number of puzzles. 
                      Generate ${additionalCount} new words that match the theme or difficulty of the existing words.
                      The response should be a list of words separated by commas.`
        },
        {
            role: 'user',
            content: `Words: "${wordsString}".`
        }
    ];

    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4o'
    });

    let output = response.choices[0].message.content;

    // Clean up the output to remove unwanted characters
    output = output.replace(/[^a-zA-Z,\s]/g, '');  // Remove any non-alphabetic characters except commas and spaces

    const additionalWords = output.split(',').map(word => word.trim());

    return additionalWords;
}

// Main function to generate word search puzzles
async function generateWordSearch(words, num_puzzles = 1, invert_words = 0) {
    const puzzles = [];
    let totalWords = words.length;
    const wordsPerPuzzle = Math.ceil(totalWords / num_puzzles);

    // Check if words can be evenly distributed across puzzles
    if (totalWords % num_puzzles !== 0) {
        const additionalWordsNeeded = num_puzzles * wordsPerPuzzle - totalWords;
        const additionalWords = await generateMissingWords(words, additionalWordsNeeded);
        words = [...words, ...additionalWords];
        totalWords = words.length;
    }

    for (let i = 0; i < num_puzzles; i++) {
        const wordsForCurrentPuzzle = words.slice(i * wordsPerPuzzle, (i + 1) * wordsPerPuzzle);

        const options = {
            cols: 25,
            rows: 25,
            dictionary: wordsForCurrentPuzzle,
            maxWords: wordsPerPuzzle,
            backwardsProbability: invert_words, // Probability to invert words
            upperCase: true,
            diacritics: false,
            maxRetries: 10 // Retry count for better placement
        };

        const ws = new WordSearch(options);

        // Ensure the words were placed correctly
        const insertedWords = ws.words.map(wordInfo => ({
            word: wordInfo.word,
            clean: wordInfo.clean.trim().toUpperCase(),
            path: wordInfo.path
        }));

        // Convert the grid to a string representation
        const puzzleString = ws.grid.map(row => row.join('')).join('\n');

        console.log(ws.grid);
        puzzles.push({
            puzzle: puzzleString,
            grid: ws.grid,
            words: insertedWords
        });
    }

    return puzzles;
}

module.exports = { generateWordSearch };

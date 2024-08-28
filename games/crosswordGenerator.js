/*const clg = require('crossword-layout-generator');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

async function generateClues(words) {
    // Join words with a comma to pass to OpenAI
    const wordsString = words.join(',');

    const context = [
        {
            role: 'system',
            content: `You are a clue generator for crossword puzzles. 
                      You will receive a list of words and you must generate one concise clue for each word. 
                      The output must be exactly one clue per word, in the same order as the input words, and each clue must be separated by a | character. 
                      The clues must be brief, accurate, and correspond exactly to the words provided. 
                      Your response must be in the same language as the provided words.
                      Do not add any extra text, explanations, or formatting. For example, if the words are "apple,banana,grape", your response should look like: 
                      "A fruit with seeds|A yellow tropical fruit|A small purple or green fruit".`
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

    const output = response.choices[0].message.content;

    // Split clues by the '|' separator
    const cluesArray = output.split('|').map(clue => clue.trim());

    // Ensure the number of clues matches the number of words
    if (cluesArray.length !== words.length) {
        throw new Error("The number of clues does not match the number of words.");
    }

    return cluesArray;
}

async function generateCluesAndAnswers(words) {
    // Generate clues for the words
    const clues = await generateClues(words);

    // Map over the array to create the desired JSON structure
    const cluesAndAnswersArray = words.map((word, index) => ({
        clue: clues[index],  // Assign the corresponding clue
        answer: word.trim()
    }));

    return cluesAndAnswersArray;
}

async function generateCrossword(words, words_per_puzzle, num_puzzles) {
    const cluesAndAnswers = await generateCluesAndAnswers(words);

    const layout = clg.generateLayout(cluesAndAnswers);

    // Adjust the start positions in layout.result from 1-based to 0-based
    const adjustedResult = layout.result.map(word => ({
        ...word,
        startx: word.startx - 1, // Convert startx to 0-based index
        starty: word.starty - 1  // Convert starty to 0-based index
    }));

    return {
        rows: layout.rows,
        cols: layout.cols,
        table: layout.table, // 2D array representing the crossword grid
        outputHtml: layout.table_string, // Crossword as plain text (with HTML line breaks)
        outputJson: adjustedResult // JSON containing words with their positions and orientations
    };
}

module.exports = { generateCrossword };*/

const clg = require('crossword-layout-generator');
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

// Function to generate missing words using AI if needed
async function generateMissingWords(words, additionalCount) {
    const wordsString = words.join(',');

    const context = [
        {
            role: 'system',
            content: `You are a word generator for a crossword puzzle. 
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

// Function to generate clues using AI
async function generateClues(words) {
    const wordsString = words.join(',');

    const context = [
        {
            role: 'system',
            content: `You are a clue generator for crossword puzzles. 
                      You will receive a list of words and you must generate one concise clue for each word. 
                      The output must be exactly one clue per word, in the same order as the input words, and each clue must be separated by a | character. 
                      The clues must be brief, accurate, and correspond exactly to the words provided. 
                      Your response must be in the same language as the provided words.`
        },
        {
            role: 'user',
            content: `Words: "${wordsString}".`
        }
    ];

    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4'
    });

    const output = response.choices[0].message.content;

    // Split clues by the '|' separator
    const cluesArray = output.split('|').map(clue => clue.trim());

    // Ensure the number of clues matches the number of words
    if (cluesArray.length !== words.length) {
        throw new Error("The number of clues does not match the number of words.");
    }

    return cluesArray;
}

async function generateCluesAndAnswers(words) {
    // Generate clues for the words
    const clues = await generateClues(words);

    // Map over the array to create the desired JSON structure
    const cluesAndAnswersArray = words.map((word, index) => ({
        clue: clues[index],  // Assign the corresponding clue
        answer: word.trim()
    }));

    return cluesAndAnswersArray;
}

async function generateCrossword(words, words_per_puzzle, num_puzzles) {
    const totalWordsNeeded = words_per_puzzle * num_puzzles;

    // Check if the number of provided words is enough
    if (words.length < totalWordsNeeded) {
        const additionalWordsNeeded = totalWordsNeeded - words.length;
        const additionalWords = await generateMissingWords(words, additionalWordsNeeded);
        words = [...words, ...additionalWords];
    }

    const crosswords = [];

    for (let i = 0; i < num_puzzles; i++) {
        // Select words for the current puzzle
        const wordsForCurrentPuzzle = words.slice(i * words_per_puzzle, (i + 1) * words_per_puzzle);

        // Generate clues and answers for these words
        const cluesAndAnswers = await generateCluesAndAnswers(wordsForCurrentPuzzle);

        // Generate layout for the crossword
        const layout = clg.generateLayout(cluesAndAnswers);

        // Adjust the start positions in layout.result from 1-based to 0-based
        const adjustedResult = layout.result.map(word => ({
            ...word,
            startx: word.startx - 1, // Convert startx to 0-based index
            starty: word.starty - 1  // Convert starty to 0-based index
        }));

        crosswords.push({
            rows: layout.rows,
            cols: layout.cols,
            table: layout.table, // 2D array representing the crossword grid
            outputHtml: layout.table_string, // Crossword as plain text (with HTML line breaks)
            outputJson: adjustedResult // JSON containing words with their positions and orientations
        });
    }

    return crosswords;
}

module.exports = { generateCrossword };

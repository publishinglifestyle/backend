const clg = require('crossword-layout-generator');
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
        answer: word
    }));

    return cluesAndAnswersArray;
}

async function generateCrossword(words) {
    const cluesAndAnswers = await generateCluesAndAnswers(words);
    console.log(cluesAndAnswers);
    const layout = clg.generateLayout(cluesAndAnswers);

    return {
        rows: layout.rows,
        cols: layout.cols,
        table: layout.table, // 2D array representing the crossword grid
        outputHtml: layout.table_string, // Crossword as plain text (with HTML line breaks)
        outputJson: layout.result // JSON containing words with their positions and orientations
    };
}

module.exports = { generateCrossword };

const clg = require('crossword-layout-generator');

// Function to generate clues and answers
function generateCluesAndAnswers(words, clues) {
    // Validate that the number of words matches the number of clues
    if (words.length !== clues.length) {
        return { error: "The number of words must match the number of clues." };
    }

    // Create the desired JSON structure
    return words.map((word, index) => ({
        clue: clues[index],  // Assign the corresponding clue
        answer: word.trim()
    }));
}

function shuffleWordsAndClues(words, clues) {
    const combined = words.map((word, index) => ({ word, clue: clues[index] }));

    for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]]; // Swap elements
    }

    // Separate the words and clues back into their respective arrays
    return {
        words: combined.map(item => item.word),
        clues: combined.map(item => item.clue)
    };
}

async function generateCrossword(words, clues, words_per_puzzle, num_puzzles) {
    const totalWordsNeeded = words_per_puzzle * num_puzzles;

    // Validate that the total number of words and clues matches the total number needed for all puzzles
    if (words.length !== totalWordsNeeded || clues.length !== totalWordsNeeded) {
        return {
            error: `The total number of words (${words.length}) and clues (${clues.length}) must match the total number needed for ${num_puzzles} puzzles (${totalWordsNeeded}).`
        };
    }

    // Shuffle the words and clues together
    const shuffled = shuffleWordsAndClues(words, clues);
    words = shuffled.words;
    clues = shuffled.clues;

    const crosswords = [];

    for (let i = 0; i < num_puzzles; i++) {
        // Select words and clues for the current puzzle
        const wordsForCurrentPuzzle = words.slice(i * words_per_puzzle, (i + 1) * words_per_puzzle);
        const cluesForCurrentPuzzle = clues.slice(i * words_per_puzzle, (i + 1) * words_per_puzzle);

        try {
            // Generate clues and answers for these words
            const cluesAndAnswers = generateCluesAndAnswers(wordsForCurrentPuzzle, cluesForCurrentPuzzle);

            // If there's an error in clues and answers generation, return it
            if (cluesAndAnswers.error) {
                return cluesAndAnswers;
            }

            // Generate layout for the crossword
            const layout = clg.generateLayout(cluesAndAnswers);

            // Validate the generated layout
            if (!layout || !Array.isArray(layout.table) || layout.table.length !== layout.rows || layout.table[0].length !== layout.cols) {
                console.error(`Invalid crossword layout generated for puzzle ${i + 1}`);
                continue;
            }

            // Validate layout.result to ensure all words are correctly placed
            const validWords = layout.result.filter(word => word.orientation !== 'none');
            if (validWords.length !== wordsForCurrentPuzzle.length) {
                console.error(`Not all words were placed correctly in puzzle ${i + 1}.`);
                continue;
            }

            // Adjust the start positions in layout.result from 1-based to 0-based
            const adjustedResult = validWords.map(word => ({
                ...word,
                startx: word.startx - 1, // Convert startx to 0-based index
                starty: word.starty - 1  // Convert starty to 0-based index
            }));

            // Ensure adjusted result is properly formatted
            if (!adjustedResult.every(word => word.startx >= 0 && word.starty >= 0)) {
                console.error(`Invalid start positions in layout result for puzzle ${i + 1}`);
                continue;
            }

            // Collect the final crossword data
            crosswords.push({
                rows: layout.rows,
                cols: layout.cols,
                table: layout.table, // 2D array representing the crossword grid
                outputHtml: layout.table_string, // Crossword as plain text (with HTML line breaks)
                outputJson: adjustedResult // JSON containing words with their positions and orientations
            });

        } catch (error) {
            console.error(`Error generating crossword for puzzle ${i + 1}:`, error);
            continue; // Skip this puzzle and continue to the next one
        }
    }

    // Ensure that crosswords array is not empty before returning
    if (crosswords.length === 0) {
        return { error: "Failed to generate any valid crossword puzzles." };
    }

    return crosswords;
}

module.exports = { generateCrossword };

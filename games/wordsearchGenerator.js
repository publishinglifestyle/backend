const WordSearch = require("@blex41/word-search");

function generateWordSearch(words) {
    // Define the options
    const options = {
        cols: 17,
        rows: 17,
        disabledDirections: ["NW", "SW", "NE", "SE"],
        dictionary: words,
        maxWords: 20,
        backwardsProbability: 0,
        upperCase: true,
        diacritics: true
    };

    // Create a new WordSearch puzzle with the options
    const ws = new WordSearch(options);

    // Get the puzzle grid as a 2D array
    const grid = ws.grid;

    // Get the words successfully inserted into the grid along with their paths
    const insertedWords = ws.words.map(wordInfo => ({
        word: wordInfo.word,
        clean: wordInfo.clean,
        path: wordInfo.path // Path contains the coordinates of each letter in the grid
    }));

    // Convert the grid to a string representation
    const puzzleString = ws.toString();

    // Return the puzzle, the grid, and the list of words with their paths for the solution
    return {
        puzzle: puzzleString, // The grid as a string
        grid: grid, // The grid as a 2D array
        words: insertedWords // The words with their paths
    };
}

module.exports = { generateWordSearch };

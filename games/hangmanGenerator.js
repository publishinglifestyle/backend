// Function to generate the Hangman game JSON for a single word
function generateSingleHangman(word) {
    if (!word) {
        throw new Error("A word must be provided to generate a Hangman game.");
    }

    // Generate the masked word with underscores corresponding to the word's length
    const maskedWord = word.split('').map(() => '_').join(' ');

    // Generate the JSON structure
    const hangmanJson = {
        word: word, // The word to guess
        maskedWord: maskedWord, // Masked word with underscores matching the word length
        instructions: "Guess the word by suggesting letters." // Instructions
    };

    // Return the JSON object
    return hangmanJson;
}

// Function to generate Hangman games for an array of words
function generateHangman(words) {
    if (!Array.isArray(words) || words.length === 0) {
        throw new Error("An array of words must be provided to generate Hangman games.");
    }

    // Generate a Hangman game for each word in the array
    const hangmanGames = words.map(word => generateSingleHangman(word));

    // Return the array of Hangman game objects
    return { response: hangmanGames };
}

module.exports = { generateHangman };

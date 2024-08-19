// wordScramblerGenerator.js

function scrambleWord(word) {
    if (typeof word !== 'string' || word.length === 0) {
        throw new Error("A valid string must be provided to scramble.");
    }

    const wordArray = word.split('');

    // Shuffle the array using Fisher-Yates algorithm
    for (let i = wordArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wordArray[i], wordArray[j]] = [wordArray[j], wordArray[i]];
    }

    const scrambledWord = wordArray.join('');

    // Ensure the scrambled word is different from the original
    if (scrambledWord === word) {
        return scrambleWord(word); // Retry if the word hasn't changed
    }

    // Generate the JSON structure
    const scrambledWordJson = {
        originalWord: word,
        scrambledWord: scrambledWord,
        instructions: "Try to unscramble the word!"
    };

    return scrambledWordJson;
}

function scrambleWords(words) {
    if (!Array.isArray(words)) {
        throw new Error("An array of words must be provided.");
    }

    const scrambledWordsArray = words.map(word => {
        if (typeof word !== 'string') {
            throw new Error(`Invalid word type: ${typeof word}. Expected a string.`);
        }
        return scrambleWord(word);
    });

    return scrambledWordsArray;
}

module.exports = { scrambleWords };

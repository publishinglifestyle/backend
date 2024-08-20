function generateCryptogram(phrases, revealPercentage = 0.7, extraLettersCount = 10) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    return phrases.map((phrase) => {
        let cryptogram = '';
        let letterCount = {};

        // Count the occurrence of each letter in the phrase
        for (let char of phrase.toUpperCase()) {
            if (alphabet.includes(char)) {
                if (!letterCount[char]) {
                    letterCount[char] = 0;
                }
                letterCount[char]++;
            }
        }

        // Generate the cryptogram with the required letters
        for (let char of phrase.toUpperCase()) {
            if (alphabet.includes(char)) {
                cryptogram += char;
            }
        }

        // Add extra random letters to the cryptogram
        for (let i = 0; i < extraLettersCount; i++) {
            const randomChar = alphabet[Math.floor(Math.random() * alphabet.length)];
            cryptogram += randomChar;
        }

        // Shuffle the cryptogram string to make it look random
        cryptogram = cryptogram.split('').sort(() => Math.random() - 0.5).join('');

        // Calculate the number of clues to reveal based on the revealPercentage
        const revealCount = Math.ceil(phrase.replace(/[^A-Z]/gi, '').length * revealPercentage);

        // Collect indices of all alphabetic characters in the phrase
        const indices = [];
        for (let i = 0; i < phrase.length; i++) {
            if (alphabet.includes(phrase[i].toUpperCase())) {
                indices.push(i);
            }
        }

        // Randomly select indices to reveal
        const revealedIndices = indices.sort(() => Math.random() - 0.5).slice(0, revealCount);

        // Generate the partially solved phrase with the selected clues
        const partiallySolvedPhrase = phrase.split('').map((char, index) => {
            if (alphabet.includes(char.toUpperCase())) {
                return revealedIndices.includes(index) ? char.toUpperCase() : ' _ ';
            } else {
                return char; // Preserve spaces and punctuation
            }
        }).join('');

        return {
            originalPhrase: phrase,
            cryptogram,
            partiallySolvedPhrase,
        };
    });
}

module.exports = { generateCryptogram };

const { getSudoku } = require('sudoku-gen');

// Get a Sudoku puzzle of a specific difficulty (easy, medium, hard, expert)
function generateSudoku(difficulty, num_puzzles = 1) {
    const puzzles = [];

    for (let i = 0; i < num_puzzles; i++) {
        puzzles.push(getSudoku(difficulty));
    }

    return puzzles;
}

module.exports = {
    generateSudoku
};
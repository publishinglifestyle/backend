const { getSudoku } = require('sudoku-gen');

// Get a Sudoku puzzle of a specific difficulty (easy, medium, hard, expert)
function generateSudoku(difficulty) {
    return getSudoku(difficulty);
}

module.exports = {
    generateSudoku
};
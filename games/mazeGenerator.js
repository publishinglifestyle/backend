const { PNG } = require('pngjs');

function carveGuaranteedPath(maze, width, height) {
    let x = 1;
    let y = 0;
    maze[y][x] = true;

    while (x < width - 2 || y < height - 2) {
        const directions = [];

        if (x < width - 2) directions.push([1, 0]);  // Right
        if (y < height - 2) directions.push([0, 1]); // Down

        const [dx, dy] = directions[Math.floor(Math.random() * directions.length)];
        x += dx;
        y += dy;
        maze[y][x] = true;
    }

    maze[height - 2][width - 1] = true; // Ensure exit is open
}

function generateSquareMaze(width, height) {
    let maze = Array(height).fill(null).map(() => Array(width).fill(false));

    const directions = [
        [2, 0],  // right
        [0, 2],  // down
        [-2, 0], // left
        [0, -2]  // up
    ];

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function carvePassagesFrom(cx, cy) {
        shuffleArray(directions);

        directions.forEach(direction => {
            const nx = cx + direction[0];
            const ny = cy + direction[1];
            const betweenX = cx + direction[0] / 2;
            const betweenY = cy + direction[1] / 2;

            if (nx > 0 && ny > 0 && nx < width - 1 && ny < height - 1 && !maze[ny][nx]) {
                maze[cy][cx] = true;
                maze[betweenY][betweenX] = true;
                maze[ny][nx] = true;

                carvePassagesFrom(nx, ny);
            }
        });
    }

    // Start maze generation from the top-left corner (1, 1)
    maze[1][1] = true;
    carvePassagesFrom(1, 1);

    // Ensure there's a guaranteed path from the entrance to the exit
    carveGuaranteedPath(maze, width, height);

    // Set entrance and exit
    maze[0][1] = true; // Entrance
    maze[height - 2][width - 1] = true; // Exit

    return maze;
}

function solve(
    maze,
    startX = 1,
    startY = 0,
    endX = maze.length - 2,
    endY = maze[0].length - 1
) {
    const visited = [];
    // Mark all cells as unvisited:
    for (let x = 0; x < maze.length; x++) {
        visited[x] = [];
        for (let y = 0; y < maze[x].length; y++) {
            visited[x][y] = false;
        }
    }

    const solution = [];
    let currentX = startX;
    let currentY = startY;
    let options = [];

    while (currentX !== endX || currentY !== endY) {
        visited[currentX][currentY] = true;
        options = getOptions(currentX, currentY, maze, visited);

        if (options.length === 0) {
            const [newX, newY] = solution.pop();
            currentX = newX;
            currentY = newY;
        } else {
            solution.push([currentX, currentY]);
            const [newX, newY] = options[0];
            currentX = newX;
            currentY = newY;
        }
    }

    solution.push([currentX, currentY]);

    return solution;
}

function getOptions(x, y, maze, visited) {
    const options = [];
    const rows = maze.length;
    const cols = maze[0].length;

    // can go south
    if (x + 1 < rows && !visited[x + 1][y] && maze[x + 1][y]) {
        options.push([x + 1, y]);
    }

    // can go east
    if (y + 1 < cols && !visited[x][y + 1] && maze[x][y + 1]) {
        options.push([x, y + 1]);
    }

    // can go west
    if (y - 1 >= 0 && !visited[x][y - 1] && maze[x][y - 1]) {
        options.push([x, y - 1]);
    }

    // can go north
    if (x - 1 >= 0 && !visited[x - 1][y] && maze[x - 1][y]) {
        options.push([x - 1, y]);
    }

    return options;
}

/**
 * Draws the maze and returns it as a base64-encoded PNG image.
 * @param {boolean[][]} maze - The 2D array representing the maze.
 * @param {number} cellSize - The size of each cell in the maze.
 * @returns {Promise<string>} - The base64-encoded PNG image of the maze.
 */
function drawMazeBase64(maze, cellSize) {
    return drawBase64(maze, cellSize);
}

/**
 * Draws the solution on top of the maze and returns it as a base64-encoded PNG image.
 * @param {boolean[][]} maze - The 2D array representing the maze.
 * @param {[number, number][]} solutionPath - The list of coordinates representing the solution path.
 * @param {number} cellSize - The size of each cell in the maze.
 * @returns {Promise<string>} - The base64-encoded PNG image of the maze with the solution.
 */
function drawSolutionBase64(maze, solutionPath, cellSize) {
    return drawBase64(maze, cellSize, solutionPath);
}

/**
 * Draws the maze and optionally the solution path, and returns it as a base64-encoded PNG image.
 * @param {boolean[][]} maze - The 2D array representing the maze.
 * @param {number} cellSize - The size of each cell in the maze.
 * @param {[number, number][]} [solutionPath] - Optional. The list of coordinates representing the solution path.
 * @returns {Promise<string>} - The base64-encoded PNG image of the maze.
 */
function drawBase64(maze, cellSize, solutionPath = null) {
    return new Promise((resolve, reject) => {
        const width = maze[0].length * cellSize;
        const height = maze.length * cellSize;
        const png = new PNG({ width, height });

        for (let mazeY = 0; mazeY < maze.length; mazeY++) {
            for (let mazeX = 0; mazeX < maze[mazeY].length; mazeX++) {
                const isSolutionPath = solutionPath && solutionPath.some(([px, py]) => px === mazeX && py === mazeY);

                for (let y = 0; y < cellSize; y++) {
                    for (let x = 0; x < cellSize; x++) {
                        const idx = ((mazeY * cellSize + y) * width + (mazeX * cellSize + x)) << 2;

                        if (isSolutionPath) {
                            // Draw the solution path in red, but only in the center of the cell
                            if (x > cellSize / 4 && x < 3 * cellSize / 4 && y > cellSize / 4 && y < 3 * cellSize / 4) {
                                png.data[idx] = 255;    // R
                                png.data[idx + 1] = 0;  // G
                                png.data[idx + 2] = 0;  // B
                                png.data[idx + 3] = 255; // A
                            } else {
                                // Draw the surrounding part of the path in white
                                png.data[idx] = 255;    // R
                                png.data[idx + 1] = 255; // G
                                png.data[idx + 2] = 255; // B
                                png.data[idx + 3] = 255; // A
                            }
                        } else if (maze[mazeY][mazeX]) {
                            // Draw open path in white
                            png.data[idx] = 255;    // R
                            png.data[idx + 1] = 255; // G
                            png.data[idx + 2] = 255; // B
                            png.data[idx + 3] = 255; // A
                        } else {
                            // Draw walls in black
                            png.data[idx] = 0;    // R
                            png.data[idx + 1] = 0; // G
                            png.data[idx + 2] = 0; // B
                            png.data[idx + 3] = 255; // A
                        }
                    }
                }
            }
        }

        const chunks = [];
        png.pack()
            .on('data', (chunk) => chunks.push(chunk))
            .on('end', () => {
                const buffer = Buffer.concat(chunks);
                const base64 = buffer.toString('base64');
                resolve(base64);
            })
            .on('error', (err) => reject(err));
    });
}


/**
 * Generates a maze and its solution and returns them as base64-encoded PNGs.
 * @param {number} width - The width of the maze in cells (should be an odd number).
 * @param {number} height - The height of the maze in cells (should be an odd number).
 * @param {number} cellSize - The size of each cell in the maze.
 * @returns {Promise<{ maze: string, solution: string }>} - The base64-encoded PNG images of the maze and its solution.
 */
async function generateMazeWithSolutionBase64(width, height, cellSize = 10) {
    const maze = generateSquareMaze(width, height);
    console.log('Generated Maze:', maze); // Debug: Log the generated maze

    const entrance = [1, 0];
    const exit = [height - 2, width - 1]; // Adjusting to match maze dimensions
    const solutionPath = solve(maze, entrance[0], entrance[1], exit[0], exit[1]);

    console.log('Solution Path:', solutionPath); // Debug: Log the solution path

    const mazeBase64 = await drawMazeBase64(maze, cellSize);
    const solutionBase64 = await drawSolutionBase64(maze, solutionPath, cellSize);
    return { maze: mazeBase64, solution: solutionBase64 };
}



module.exports = { generateMazeWithSolutionBase64 };

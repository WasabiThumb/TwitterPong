/*/ Initialize /*/
const Twit = require('twit')
const tokens = require('./tokens.json')

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('db.json')
const db = low(adapter)
db.defaults({ turns: 0, redScore: 0, blueScore: 0 }).write()

let appToken = tokens.app.token;
let appSecret = tokens.app.secret;

const constructBot = ((pair) => {
	return new Twit({
		consumer_key: appToken,
		consumer_secret: appSecret,
		access_token: pair.token,
		access_token_secret: pair.secret,
		timeout_ms: 60e3,
		strictSSL: true
	});
});

const RED = constructBot(tokens.red);
const BLUE = constructBot(tokens.blue);

(() => {

	/*/ Variables /*/
	var redY = 3;
	var blueY = 3;
	var ballX = 4;
	var ballY = 4;
	var ballDX = (Math.random() < 0.5 ? -1 : 1);
	var ballDY = (Math.random() < 0.5 ? -1 : 1);
	var dead = false;
	var dizzy = false;
	var recovered = false;

	/*/ Main Loop /*/
	const main = (async () => {
		let red_mid = "";
		let blue_mid = "";
		while (true) {
			var turns = db.get('turns').value()+1;
			db.set('turns', turns).write();
			let blueScore = db.get('blueScore').value();
			let redScore = db.get('redScore').value();
			
			/*/ Tick /*/
			tick();
			let bottom = "\n\n⬆️🔁                             ❤️⬇️";
			let screenRed = "Turns: " + turns + "\n" + "Score: " + redScore + "-" + blueScore + "\n\n" + render(false) + bottom;
			let screenBlue = "Turns: " + turns + "\n" + "Score: " + blueScore + "-" + redScore + "\n\n" + render(true) + bottom;
			
			/*/ Clean /*/
			var doInput = true;
			if (dead){
				if (ballX == 0){
					// blue won
					blueScore += 1;
					db.set('blueScore', blueScore).write();
				} else if (ballX == 8){
					// red won
					redScore += 1;
					db.set('redScore', redScore).write();
				}
				redY = 3;
				blueY = 3;
				ballX = 4;
				ballY = 4;
				ballDX = (Math.random() < 0.5 ? -1 : 1);
				ballDY = (Math.random() < 0.5 ? -1 : 1);
				dead = false;
				dizzy = false;
				recovered = false;
				doInput = false;
			}
			
			red_mid = await new Promise((res) => {
				RED.post('statuses/update', {status: screenRed}, (err, data, response) => {
					if (err) throw err;
					res(data.id_str);
				});
			});
			console.log("red status sent: " + red_mid);
			
			blue_mid = await new Promise((res) => {
				BLUE.post('statuses/update', {status: screenBlue}, (err, data, response) => {
					if (err) throw err;
					res(data.id_str);
				});
			});
			console.log("blue status sent: " + blue_mid);
			
			console.log("waiting 30 minutes");
			await new Promise((res) => {
				setTimeout(res, 60e3*30);
			});
			console.log("done!");
			
			/*/ Input /*/
			if (doInput){
				console.log("accepting input");
				let dz = await Promise.all([
					new Promise((res) => {
						RED.get('statuses/show.json?id=' + red_mid, {}, (err, data, response) => {
							if (err) throw err;
							res(data);
						})
					}),
					new Promise((res) => {
						BLUE.get('statuses/show.json?id=' + blue_mid, {}, (err, data, response) => {
							if (err) throw err;
							res(data);
						})
					})
				]);
				
				let redUp = (dz[0].retweet_count > dz[0].favorite_count);
				let blueUp = (dz[1].retweet_count > dz[1].favorite_count);

				redY += (redUp ? -1 : 1);		
				blueY += (blueUp ? -1 : 1);
			}
		}
	});

	/*/ Tick /*/
	const tick = (() => {
		redY = Math.min(Math.max(redY, 0), 6)
		blueY = Math.min(Math.max(blueY, 0), 6)
		
		dead = false;
		recovered = dizzy;
		dizzy = false;
		if (ballX == 0 || ballX == 8){
			dead = true;
			return;
		}
		
		let nextX = ballX + ballDX;
		let nextY = ballY + ballDY;
		
		if (nextX == 0 || nextY == 8){
			paddleTop = (nextX == 0 ? redY : blueY);
			paddleBottom = paddleTop + 2;
			if (ballY >= paddleTop && ballY <= paddleBottom){
				ballDX *= -1;
				if (ballY !== (paddleTop + 1)) ballX += ballDX;
				dizzy = true;
			}
		}
		if (nextY < 0 || nextY > 8) ballDY *= -1;
		
		ballX += ballDX;
		ballX = Math.min(Math.max(ballX, 0), 8);
		ballY += ballDY;
		ballY = Math.min(Math.max(ballY, 0), 8);
	});

	/*/ Renderer /*/
	let e_dizzy = "😲";
	let e_dead = "😵";
	let e_recovered = "😌";
	let e_normal = "😠";
	let e_empty = "⬛";
	let e_red = "🟥";
	let e_blue = "🟦";
	let e_trail = "🟧";
	const render = ((flipped) => {
		var chars = [];
		for (let x=0; x < 9; x++){
			var proto = [];
			for (let y=0; y < 9; y++){
				proto[y] = e_empty;
			}
			chars[x] = proto;
		}
		for (let a=0; a < 3; a++){
			chars[0][redY+a] = e_red;
			chars[8][blueY+a] = e_blue;
		}
		var player = e_normal;
		if (recovered) player = e_recovered;
		if (dizzy) player = e_dizzy;
		if (dead) player = e_dead;
		chars[ballX][ballY] = player;
		/*
		var nX = ballX - ballDX;
		var nY = ballY - ballDY;
		if (nX > -1 && nX < 9 && nY > -1 && nY < 9){
			if (chars[nX][nY] === e_empty){
				chars[nX][nY] = e_trail;
			}
		}
		*/
		var ret = "";
		for (let y=0; y < 9; y++){
			if (flipped){
				for (let x=8; x > -1; x--){
					ret += chars[x][y];
				}
			} else {
				for (let x=0; x < 9; x++){
					ret += chars[x][y];
				}
			}
			ret += "\n";
		}
		return ret;
	});

	/*/ Call Main /*/
	main();

})();

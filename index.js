const Discord = require("discord.js"),
	fs = require("fs"),
	mongoose = require("mongoose"),
	Canvas = require("canvas"),
	snekfetch = require("snekfetch"),
	ytdl = require("ytdl-core"),
	YouTube = require('simple-youtube-api');
const bot = new Discord.Client({ disableEveryone: false });
const queue = new Map(); //* used for music bot
bot.commands = new Discord.Collection(); //* used for command handeling
const botconfig = require("./botconfig.json"),
	activities = require("./assets/activity.json"),
	bList = require("./assets/blacklist.json"),
	errors = require("./utils/errors.js"),
	musicCMD = require("./utils/music.js"),
	xpMongoose = require("./models/xp.js"),
	Money = require("./models/money.js"),
	Reports = require("./models/reports.js"),
	banMongoose = require("./models/banned.js");

const youtube = new YouTube(botconfig.ytToken); //* sets up youtube with my API key

mongoose.connect('mongodb://localhost:27017/DoggoChan', { //* connects to the db
	useNewUrlParser: true
});

const recentCommands = new Set(); //* Used for cooldown system

var ownerID = "264187153318281216";

//TODO: 1) add the word filter to editted messages
//TODO: 2) make things, such as word filter, optional in the mongod database
//TODO: 3) edit search embed with selected song
//TODO: 4) only allow one search per user to be open per time

//! music bot
bot.on("message", async message => {
	if (message.channel.type === "dm") return; //* if the message is in the dms, it will return as the music bot is not meant for the dms
	//* gets prefix
	let prefixes = JSON.parse(fs.readFileSync("./prefixes.json", "utf8"));
	if (!prefixes[message.guild.id]) {
		prefixes[message.guild.id] = {
			prefixes: botconfig.prefix
		};
	}

	let prefix = prefixes[message.guild.id].prefixes;

	//* vars
	var args = message.content.substring(prefix.length).split(" ");
	if (!message.content.startsWith(prefix)) return;
	var searchString = args.slice(1).join(' ');
	var url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	var serverQueue = queue.get(message.guild.id);

	switch (args[0].toLowerCase()) { //* handeler for music commands
		case "play": //! play
			var voiceChannel = message.member.voiceChannel; //* gets the VC channel of the person who sent the message
			if (!voiceChannel) return errors.notInVC(message);  //* returns if the author is not in a VC

			if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) { //* checks if the URL sent is a playlist
				var playlist = await youtube.getPlaylist(url); //* saves playlist link as a playlist
				var videos = await playlist.getVideos(); //* gets videos in playlist
				for (const video of Object.values(videos)) { //* finds videos in list of videos from playlist var
					var video2 = await youtube.getVideoByID(video.id);
					await handleVideo(video2, message, voiceChannel, true);
				}

				//* embed for queue add
				//TODO: move to ./utils/music.js
				const addListQueue = new Discord.RichEmbed()
					.setDescription(`**${playlist.title}** has been added to the queue!`)
					.setColor('RANDOM')
					.setFooter(`Done by ${message.author.username}`)

				return message.channel.send(addListQueue); //* sends addListQueue embed
			} else { //* if the URL !== playlist
				try {
					var video = await youtube.getVideo(url); //* checks if the URL is a YouTube video
				} catch (error) { //* if it isn't a video...
					try {

						var videos = await youtube.searchVideos(searchString, 10);
						var index = 0;

						//* embed for search
						//TODO: move to ./util/music.js
						const searchEmbed = new Discord.RichEmbed()
							.setTitle("**Please provide a value to select one of the search results ranging from 1-10.**")
							.setDescription(`${videos.map(video2 => `**${++index}**--***${video2.title.replace('*', '')}***`).join('\n')}`)
							.setColor('RANDOM')
							.setFooter(`Done by ${message.author.username}`)

						message.channel.send(searchEmbed); //* sends search embed
						try { //* cheks if the respopnse is a number to select a song with
							var response = await message.channel.awaitMessages(message2 => message2.content > 0 && message2.content < 11, {
								maxMatches: 1,
								time: 100000000,
								errors: ['time']
							});
						} catch (err) { //* finds error
							console.error(err);
							return errors.noValMus(message);
						}
						var videoIndex = parseInt(response.first().content);
						var video = await youtube.getVideoByID(videos[videoIndex - 1].id); //* selects song
					} catch (err) { //* logs error
						console.error(err);
						return errors.obtainErr(message);
					}
				}
				return handleVideo(video, message, voiceChannel); //* returns with handlevideo function
			}
		case "skip": //! skip
			if (!message.member.voiceChannel) return errors.notInVC(message); //* checks if member is in a VC
			if (!serverQueue) return errors.noQueue(message); //* chekcs if the queue is empty
			serverQueue.connection.dispatcher.end("**Song Skipped**"); //* logs skip 
			return undefined;
			break; //* end

		case "stop": //! stop
			if (!message.member.voiceChannel) return errors.notInVC(message); //* checks if in VC
			if (!serverQueue) return errors.noQueue(message); //* checks if the queue is empty
			serverQueue.songs = [];
			serverQueue.connection.dispatcher.end('**Stop command has been used!**'); //* logs stop command
			return undefined; //* end

		case "vol": //! vol 
			if (!message.member.voiceChannel) return errors.notInVC(message); //* checks if user is in VC
			if (!serverQueue) return errors.nothPlaying(message); //* checks if queue is empty
			if (!args[1]) return musicCMD.vol(message, serverQueue); //* if there is no value return with embed that has current volume
			serverQueue.volume = args[1]; //* sets vol var
			serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5); //* sets vol
			return musicCMD.volSet(message, args); //* returns with embed that has new vol

		//TODO: add check if the bot is playing for np and queue
		case "np": //! np
			//* this command is for the user to see what is currently playing
			if (!serverQueue) return errors.nothPlaying(message); //* if queue is empty, then return with error saying nothing is playing
			return musicCMD.np(message, serverQueue); //* returns with embed that has the current playing song

		case "queue": //! queue
			//! this command is for the user to see the queue
			if (!serverQueue) return errors.nothPlaying(message); //* if the queue is empty return with error saying the queue is empty
			return musicCMD.queue(message, serverQueue); //* returns with embed that has the current queue

		case "pause": //! pause
			if (serverQueue && serverQueue.playing) { //* if the queue isn't empty and the queue is playing...
				serverQueue.playing = false;  //* sets playing to false
				serverQueue.connection.dispatcher.pause(); //* pauses dispatcher
				return musicCMD.pause(message); //* return with pause embed
			}

			return errors.nothPlaying(message); //* if nothing is playing return with error saying nothing is playing

			break; //* ends

		case "resume": //! resume
			if (serverQueue && !serverQueue.playing) { //* if the queue isn't empty and the bot is not playing...
				serverQueue.playing = true; //* set playing to true
				serverQueue.connection.dispatcher.resume(); //* resumes the dispatcher
				return musicCMD.resume(message); //* returns with resume embed
			}

			//TODO: change to queue empty embed in ./utill/erros.js
			//! READ THIS NERD
			return errors.nothPlaying(message);
			return undefined;
			break;
	}

	async function handleVideo(video, message, voiceChannel, playlist = false) { //* function for using getting video
		var serverQueue = queue.get(message.guild.id); //* gets server queue
		//console.log(video); //! this logs the video but it muddies my logs and thus should be removed
		var song = { //* sets song var
			id: video.id,
			title: video.title,
			url: `https://www.youtube.com/watch?v=${video.id}`
		};

		if (!serverQueue) { //* if the queue is empty, make new queue
			var queueConstruct = {
				textChannel: message.channel,
				voiceChannel: voiceChannel,
				connection: null,
				songs: [],
				volume: 5,
				playing: true
			};
			queue.set(message.guild.id, queueConstruct); //* sets new queue

			queueConstruct.songs.push(song);

			try {
				var connection = await voiceChannel.join(); //* joins VC
				queueConstruct.connection = connection;
				play(message.guild, queueConstruct.songs[0]); //* plays song
			} catch (error) { //* logs errors
				console.error(`I could not join the voice channel: ${error}`);
				queue.delete(message.guild.id);
				return errors.cantConn(message);
			}
		} else { //* adds playlist to queue
			serverQueue.songs.push(song);
			console.log(serverQueue.songs);
			if (playlist) return undefined;
			else return musicCMD.addQueue(message, song);
		}

		return undefined;
	}

	function play(guild, song) { //* play function
		var serverQueue = queue.get(guild.id); //* gets queue

		if (!song) {
			serverQueue.voiceChannel.leave(); //* leaves the VC is there are no songs
			queue.delete(guild.id); //* removes the server from the queue
			return; //* ends

		}

		const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
			.on('end', reason => {
				if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
				else console.log(reason);
				serverQueue.songs.shift();
				play(guild, serverQueue.songs[0]);

			})
			.on('error', error => console.error(error));
		dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
		musicCMD.startPlay(serverQueue, song);
	}
});

fs.readdir("./commands/", (err, files) => {
	if (err) console.log(err);
	let jsfile = files.filter(f => f.split(".").pop() === "js");
	if (jsfile.length <= 0) {
		console.log("Couldn't find commands.");
		return;
	}

	jsfile.forEach((f, i) => {
		let props = require(`./commands/${f}`);
		console.log(`${f} loaded!`);
		bot.commands.set(props.help.name, props);
	});
});

//! changes the canvas font to a level where it doesn't consume the entrire message
const applyText = (canvas, text) => {
	const ctx = canvas.getContext('2d');

	//* Font size
	let fontSize = 70;

	do {
		//* Sets the font
		ctx.font = `${fontSize -= 10}px sans-serif`;
	} while (ctx.measureText(text).width > canvas.width - 300);

	return ctx.font;
};

//! For the member count
const applyText2 = (canvas, text) => {
	const ctx = canvas.getContext('2d');

	//* Font size
	let fontSize = 80;

	do {
		//* Sets the font
		ctx.font = `${fontSize -= 10}px sans-serif`;
	} while (ctx.measureText(text).width > canvas.width - 300);

	return ctx.font;
};


bot.on('error', (e) => {
	errors.logError(e, bot, ownerID);
	console.error(e);
	bot.destroy()
	.then(() => {
		bot.login(botconfig.token)
	});

});

bot.on('disconnect', () => {
	bot.users.find(ownerID).send("I have shut down");
});

bot.on("ready", () => {
	//* gives info on bot status
	let pluralnonpluralservers = (bot.guilds.size > 1) ? 'Servers' : 'Server';
	let pluralnonpluralusers = (bot.users.size > 1) ? 'Users' : 'User';

	console.log(`\n\n${bot.user.username} is online.\nOperating on ${bot.guilds.size} ${pluralnonpluralservers}.\nOperating for ${bot.users.size} ${pluralnonpluralusers}.\n\n`);
	//* randomly sets activity
	bot.setInterval(() => {
		const activity = activities[Math.floor(Math.random() * activities.length)];
		bot.user.setActivity(activity.text, { type: activity.type });
	}, 60000);
});

bot.on('guildCreate', (guild) => {
	console.log(`\n\n[Console] Joined the Guild ${guild.name}.\nGuild Owner: ${guild.owner.user.tag}\nNumber of Members: ${guild.memberCount}\nGuild Location: ${guild.region}\n\n`);

	guild.createChannel("logs", "text");
	guild.createChannel("reports", "text");
	guild.createChannel("member-log", "text");
});

bot.on('guildDelete', (guild) => {
	console.log(`\n\n[Console] Left the Guild ${guild.name}.\nGuild Owner: ${guild.owner.user.tag}\nNumber of Members: ${guild.memberCount}\nGuild Location: ${guild.region}\n\n`);

	Money.findByIdAndDelete({
		serverID: guild.id
	}, (err, res) => {
		if (err) console.log(err);
	});

	xpMongoose.findByIdAndDelete({
		serverID: guild.id
	}, (err, res) => {
		if (err) console.log(err);
	});

	banMongoose.findByIdAndDelete({
		serverID: guild.id
	}, (err, res) => {
		if (err) console.log(err);
	});

	Reports.findByIdAndDelete({
		serverID: guild.id
	}, (err, res) => {
		if (err) console.log(err);
	});
})

bot.on('guildBanAdd', (guild, user) => {
	var d = Date.now();

	//!Removes banned user from database
	Money.findOneAndDelete({
		userID: user.id,
		serverID: guild.id
	}, (err, res) => {
		if (err) console.log(err);
		console.log(`${user.id} has been banned from ${guild} and thus has been removed from the database`);
	});

	xpMongoose.findOneAndDelete({
		userID: user.id,
		serverID: guild.id
	}, (err, res) => {
		if (err) console.log(err);
		console.log(`${user.id} has been banned from ${guild} and thus has been removed from the database`);
	});

	banMongoose.findOne({
		serverID: guild.id
	}, (err, ban) => {
		if (err) console.log(err);

		if (!ban) {
			const newBan = new banMongoose({
				userID: user.id,
				userName: user.username,
				serverID: guild.id,
				date: d.toString(),
				reason: "none"
			})

			newBan.save().catch(err => console.log(err));
		} else {
			return;
		}
	})
});

bot.on('guildMemberAdd', async member => {
	Money.findOne({
		userID: member.id,
		serverID: member.guild.id
	}, (err, money) => {
		if (err) console.log(err);

		if (!money) {
			const newMoney = new Money({
				userID: member.id,
				serverID: member.guild.id,
				money: 0
			})

			newMoney.save().catch(err => console.log(err));
		}
	})

	xpMongoose.findOne({
		userID: member.id,
		serverID: member.guild.id
	}, (err, xp) => {
		if (err) console.log(err);

		if (!xp) {
			const newXP = new xpMongoose({
				userID: member.id,
				serverID: member.guild.id,
				xp: 0,
				level: 1
			})

			newXP.save().catch(err => console.log(err));
		}
	})

	//* Finds channel
	const channel = member.guild.channels.find(ch => ch.name === 'member-log');
	if (!channel) return;

	//* Makes canvas
	const canvas = Canvas.createCanvas(700, 250);
	const ctx = canvas.getContext('2d');

	//* Adds background
	const background = await Canvas.loadImage("./assets/snow.jpg");
	ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

	//* Adds border
	ctx.strokeStyle = '#143ebc';
	ctx.strokeRect(0, 0, canvas.width, canvas.height);

	//* Adds text to the top
	ctx.font = '28px sans-serif';
	ctx.fillStyle = '#ffffff';
	ctx.fillText('Welcome to the server,', canvas.width / 2.5, canvas.height / 3.5);


	//* Adds text
	ctx.font = applyText(canvas, `${member.displayName}!`); //* assigns font
	ctx.fillStyle = '#ffffff';
	ctx.fillText(`${member.displayName}!`, canvas.width / 2.5, canvas.height / 1.8);

	ctx.font = applyText2(canvas, `You are the ${member.guild.memberCount}th member!`); //* assigns font
	ctx.fillStyle = '#ffffff';
	ctx.fillText(`You are the ${member.guild.memberCount}th member!`, canvas.width / 2.5, canvas.height / 1.3);

	//* Makes avatar circuliar
	ctx.beginPath();
	ctx.arc(125, 125, 100, 0, Math.PI * 2, true);
	ctx.closePath();
	ctx.clip();
	ctx.strokeStyle = '#000000';
	ctx.stroke();

	//* Adds avatar
	const { body: buffer } = await snekfetch.get(member.user.displayAvatarURL);
	const avatar = await Canvas.loadImage(buffer);
	ctx.drawImage(avatar, 25, 25, 200, 200);

	//* Adds image
	const attachment = new Discord.Attachment(canvas.toBuffer(), 'welcome-image.png')

	//* Sends image
	channel.send(`Welcome to the server, ${member}!`, attachment);
});

bot.on('guildMemberRemove', async member => {
	//! Removes left use from database
	Money.findOneAndDelete({
		userID: member.id,
		serverID: member.guild.id
	}, (err, res) => {
		if (err) console.log(err)
		console.log(`${member.id} left ${member.guild} and thus has been removed from the database`)
	});

	xpMongoose.findOneAndDelete({
		userID: member.id,
		serverID: member.guild.id
	}, (err, res) => {
		if (err) console.log(err)
		console.log(`${member.id} left ${member.guild} and thus has been removed from the database`)
	});

	//* Finds channel
	const channel = member.guild.channels.find(ch => ch.name === 'member-log');
	if (!channel) return;

	//* Makes canvas
	const canvas = Canvas.createCanvas(700, 250);
	const ctx = canvas.getContext('2d');

	//* Adds background
	const background = await Canvas.loadImage("./assets/snow.jpg");
	ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

	//* Adds border
	ctx.strokeStyle = '#143ebc';
	ctx.strokeRect(0, 0, canvas.width, canvas.height);

	//* Adds text to the top
	ctx.font = '26px sans-serif';
	ctx.fillStyle = '#ffffff';
	ctx.fillText('This user has left the server,', canvas.width / 2.5, canvas.height / 3.5);


	//* Adds text
	ctx.font = applyText(canvas, `${member.displayName}.`); //* assigns font
	ctx.fillStyle = '#ffffff';
	ctx.fillText(`${member.displayName}.`, canvas.width / 2.5, canvas.height / 1.8);

	ctx.font = applyText2(canvas, `There are ${member.guild.memberCount} left.`); //* assigns font
	ctx.fillStyle = '#ffffff';
	ctx.fillText(`There are ${member.guild.memberCount} left.`, canvas.width / 2.5, canvas.height / 1.3);

	//* Makes avatar circuliar
	ctx.beginPath();
	ctx.arc(125, 125, 100, 0, Math.PI * 2, true);
	ctx.closePath();
	ctx.clip();
	ctx.strokeStyle = '#000000';
	ctx.stroke();

	//* Adds avatar
	const { body: buffer } = await snekfetch.get(member.user.displayAvatarURL);
	const avatar = await Canvas.loadImage(buffer);
	ctx.drawImage(avatar, 25, 25, 200, 200);

	//* Adds image
	const attachment = new Discord.Attachment(canvas.toBuffer(), 'welcome-image.png')

	//* Sends image
	channel.send(`${member} has left the server!`, attachment);
});

bot.on("message", async message => {
	let prefixes = JSON.parse(fs.readFileSync("./prefixes.json", "utf8"));

	if (message.channel.type === "dm" && !message.author.bot) {
		let embed = new Discord.RichEmbed()
			.setTimestamp()
			.setTitle("Direct Message To The Bot")
			.addField(`Sent By:`, `<@${message.author.id}>`)
			.setColor("RANDOM")
			.setThumbnail(message.author.displayAvatarURL)
			.addField(`Message: `, message.content)
			.setFooter(`DM Bot Messages | DM Logs`)

		bot.users.get(ownerID).send(embed);
	}
	if (message.channel.type !== "dm") {
		if (!prefixes[message.guild.id]) {
			prefixes[message.guild.id] = {
				prefixes: botconfig.prefix
			};
		}
	} else if (!message.author.bot) {
		console.log("DM recived");
	}

	//!for my server only
	if (message.channel.type !== "dm") {
		if (message.guild.id === "498112893330391041") {
			if (!message.member.hasPermission("ADMINISTRATOR")) {
				let wordfound = false;
				for (var i in bList.words) {
					if (message.content.toLowerCase().includes(bList.words[i].toLowerCase())) wordfound = true;
					if (wordfound) break;
				}

				if (wordfound) {
					message.delete();
					return errors.bannedWord(message);
				}
			}
		}
	}

	if (message.channel.type === "dm") return;

	let prefix = prefixes[message.guild.id].prefixes;

	let messageArray = message.content.split(" ");
	let cmd = messageArray[0];
	let args = messageArray.slice(1);

	//* I have been self hosting so to keep the load down on my PC a 5 second cooldown is in place for commands
	if (message.content.startsWith(prefix) && !message.author.bot && message.channel.type !== "dm") {
		if (recentCommands.has(message.author.id)) {
			return
		} else {
			recentCommands.add(message.author.id)

			setTimeout(() => {
				recentCommands.delete(message.author.id);
			}, 5000);
		}

		let commandfile = bot.commands.get(cmd.slice(prefix.length));
		if (commandfile) commandfile.run(bot, message, args);
	} else if (!message.author.bot && message.channel.type !== "dm") {
		let coinstoadd = Math.floor(Math.random() * 50) + 1;
		let coinsneeded = Math.floor(Math.random() * 50) + 1;
		if (coinstoadd == coinsneeded) {
			let moneyEmbed = new Discord.RichEmbed()
				.setAuthor(message.author.username)
				.setColor(botconfig.doggo)
				.addField("💸", `${coinstoadd} coins given to ${message.author}! 🔥`);

			Money.findOne({
				userID: message.author.id,
				serverID: message.guild.id
			}, (err, money) => {
				if (err) console.log(err);

				if (!money) {
					const newMoney = new Money({
						userID: message.author.id,
						serverID: message.guild.id,
						money: coinstoadd
					})

					newMoney.save().catch(err => console.log(err));

					message.channel.send(moneyEmbed).then(msg => { msg.delete(5000) });
				} else {
					money.money = money.money + coinstoadd;

					money.save().catch(err => console.log(err));

					message.channel.send(moneyEmbed).then(msg => { msg.delete(5000) });
				}
			})
		} else {
			Money.findOne({
				userID: message.author.id,
				serverID: message.guild.id
			}, (err, money) => {
				if (err) console.log(err);

				if (!money) {
					const newMoney = new Money({
						userID: message.author.id,
						serverID: message.guild.id,
						money: 0
					})

					newMoney.save().catch(err => console.log(err));
				}
			})
		}

		let xpAdd = Math.floor(Math.random() * 7) + 8;

		xpMongoose.findOne({
			userID: message.author.id,
			serverID: message.guild.id
		}, (err, xp) => {
			if (err) console.log(err);

			if (!xp) {
				const newXP = new xpMongoose({
					userID: message.author.id,
					serverID: message.guild.id,
					xp: xpAdd,
					level: 1
				})

				newXP.save().catch(err => console.log(err));
			} else {
				let curlvl = xp.level;
				let nxtLvl = xp.level * 300;

				xp.xp = xp.xp + xpAdd;

				if (nxtLvl <= xp.xp) {
					xp.level = curlvl + 1;

					let lvlup = new Discord.RichEmbed()
						.setTitle("Level Up!")
						.setColor(botconfig.doggo)
						.addField("New Level", curlvl + 1);

					message.channel.send(lvlup).then(msg => { msg.delete(5000) });
				}

				xp.save().catch(err => console.log(err));
			}
		})
	}

});

bot.login(botconfig.token);

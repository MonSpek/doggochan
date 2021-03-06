const Discord = require("discord.js");
const ms = require("ms");
const botconfig = require("../botconfig.json");
const errors = require("../utils/errors.js");

module.exports.run = async (bot, message, args) => {
	message.delete();
	if (!message.member.hasPermission("MANAGE_MESSAGES")) return errors.noPerms(message, "MANAGE_MESSAGES");
	let tomute = message.guild.member(message.mentions.users.first() || message.guild.members.get(args[0]));
	if (!tomute) return message.reply("Couldn't find user.");
	if (tomute.hasPermission("MANAGE_MESSAGES")) return errors.equalPerms(message, tomute, "MANAGE_MESSAGES");
	if (tomute.id === bot.user.id) return errors.botuser(message);
	let reason = args.slice(2).join(" ");
	if (!reason) return message.reply("Please supply a reason.");

	let muterole = message.guild.roles.find(`name`, "muted");
	//start of create role
	if (!muterole) {
		try {
			muterole = await message.guild.createRole({
				name: "muted",
				color: "#000000",
				permissions: []
			})
			message.guild.channels.forEach(async (channel, id) => {
				await channel.overwritePermissions(muterole, {
					SEND_MESSAGES: false,
					ADD_REACTIONS: false
				});
			});
		} catch (e) {
			console.log(e.stack);
		}
	}
	//end of create role
	let mutetime = args[1];
	if (!mutetime) return message.reply("You didn't specify a time!").then(msg => { msg.delete(5000) });

	message.delete().catch(O_o => { });

	try {
		await tomute.send(`Hi! You've been muted for ${mutetime}. Don't break the rules next time!`)
	} catch (e) {
		message.channel.send(`A user has been muted... but their DMs are locked. They will be muted for ${mutetime}`)
	}

	let muteembed = new Discord.RichEmbed()
	.setDescription(`Mute executed by ${message.author}`)
	.setColor(botconfig.red)
	.addField("Muted User", tomute)
	.addField("Muted in", message.channel)
	.addField("Time", message.createdAt)
	.addField("Length", mutetime)
	.addField("Reason", reason);

	let incidentschannel = message.guild.channels.find(`name`, "logs");
	if (!incidentschannel) return message.reply("Please create a logs channel first!");
	incidentschannel.send(muteembed);

	await (tomute.addRole(muterole.id));

	setTimeout(function () {
		tomute.removeRole(muterole.id);
		message.channel.send(`<@${tomute.id}> has been unmuted!`);
	}, ms(mutetime));


	//end of module
}

module.exports.help = {
	name: "tempmute",
	role: "admin",
	description: "Temperally mutes a person"
}
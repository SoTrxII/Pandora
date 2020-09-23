import * as Eris from "eris";
const odp = Object.defineProperty;

function odf(obj, nm, val) {
  odp(obj, nm, { value: val, writable: false });
}

function odg(obj, nm, val) {
  odp(obj, nm, { get: val });
}

(function (cp) {
  odf(cp, "login", function () {
    return this.connect();
  });
})(Eris.Client.prototype);

Eris.Collection.prototype.some = Eris.Collection.prototype.find;

(function (egp) {
  odf(egp, "fetchMember", function (id) {
    const guild = this;
    const member = this.members.get(id);
    if (member)
      return new Promise((res) => {
        res(member);
      });
    return new Promise((res, rej) => {
      this.fetchAllMembers()
        .then(() => {
          res(guild.members.get(id));
        })
        .catch(rej);
    });
  });
  odg(egp, "voiceConnection", function () {
    return this.shard.client.voiceConnections.get(this.id);
  });
})(Eris.Guild.prototype);

odg(Eris.Member.prototype, "voiceChannel", function () {
  return this.voiceState.channelID
    ? this.guild.channels.get(this.voiceState.channelID)
    : undefined;
});

odg(Eris.Message.prototype, "guild", function () {
  return this.channel.guild;
});
odf(Eris.Message.prototype, "reply", function (content) {
  return this.channel.send(this.author.mention + ", " + content);
});

Eris.PrivateChannel.prototype.send =
  Eris.PrivateChannel.prototype.createMessage;

odg(Eris.Role.prototype, "members", function () {
  const role = this;
  return this.guild.members.filter((member) => {
    return member.roles.includes(role.id);
  });
});

(function (esp) {
  odf(esp, "send", function () {
    return process.send.apply(process, arguments);
  });
  odf(esp, "broadcastEval", function (cmd) {
    return new Promise((res, rej) => {
      process.send({ _sEval: cmd });

      function receiver(msg) {
        if (msg._sEval === cmd) res(msg._result);
        else process.once("message", receiver);
      }
      process.once("message", receiver);
    });
  });
})(Eris.Shard.prototype);

Eris.TextChannel.prototype.send = Eris.TextChannel.prototype.createMessage;

odf(Eris.User.prototype, "send", function () {
  const args = arguments;
  const user = this;
  return new Promise((res, rej) => {
    user
      .getDMChannel()
      .then((channel) => {
        channel.createMessage.apply(channel, args).then(res).catch(rej);
      })
      .catch(rej);
  });
});

odg(Eris.VoiceChannel.prototype, "joinable", function () {
  return this.permissionsOf(this.guild.shard.client.user.id).has(
    "voiceConnect"
  );
});
odg(Eris.VoiceChannel.prototype, "members", function () {
  return this.voiceMembers;
});

odg(Eris.VoiceConnection.prototype, "channel", function () {
  let ret = this.flavorSavedChannel;
  if (!ret)
    ret = this.flavorSavedChannel = this.shard.client.guilds
      .get(this.id)
      .channels.get(this.channelID);
  return ret;
});

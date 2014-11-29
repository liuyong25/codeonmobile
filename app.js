/*
  Copyright (C) 2014, Daishi Kato <daishi@axlight.com>
  All rights reserved.

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
  "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
  LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
  A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
  HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
  LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
  THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
  OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var path = require('path');
var http = require('http');
var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var express_session = require('express-session');
var socket_io = require('socket.io');
var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;
var GitHubApi = require("github");

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.BASE_URL + '/auth/github/callback'
  },
  function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() {
      return done(null, {
        accessToken: accessToken,
        refreshToken: refreshToken,
        profile: profile
      });
    });
  }
));

function getGitHubUserClient(req_user) {
  var token = req_user.accessToken;
  var github = new GitHubApi({
    version: "3.0.0",
    headers: {
      "user-agent": "CodeOnMobile"
    }
  });
  github.authenticate({
    type: 'oauth',
    token: token
  });
  return github;
}

var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(cookieParser());
app.use(bodyParser.json());
app.use(express_session({
  secret: process.env.SESSION_SECRET || 'secret-749845378925947473418910'
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', function(req, res) {
  res.render('index');
});

app.get('/auth/github',
  passport.authenticate('github'));

app.get('/auth/github/callback',
  passport.authenticate('github', {
    successRedirect: '/',
    failureRedirect: '/'
  }));

app.get('/api/profile', function(req, res) {
  if (!req.user) {
    res.json({});
    return;
  }
  var profile_json = req.user.profile ? req.user.profile._json : {};
  res.json({
    login: profile_json.login,
    name: profile_json.name,
    avatar_url: profile_json.avatar_url
  });
});

app.get('/api/repos', function(req, res) {
  if (!req.user) {
    res.json([]);
    return;
  }
  var github = getGitHubUserClient(req.user);
  github.repos.getAll({
    type: 'owner',
    sort: 'updated',
    per_page: 100
  }, function(err, result) {
    if (err) {
      console.log('error in github.repos.getAll', err);
      res.sendStatus(500);
      return;
    }
    //console.log(result);
    res.json(result.map(function(x) {
      return {
        name: x.name,
        default_branch: x.default_branch
      };
    }));
  });
});

app.get('/api/repo/files', function(req, res) {
  if (!req.user) {
    res.json([]);
    return;
  }
  var github = getGitHubUserClient(req.user);
  github.gitdata.getReference({
    user: req.user.profile.username,
    repo: req.query.repo_name,
    ref: 'heads/' + req.query.repo_branch
  }, function(err, result) {
    if (err) {
      console.log('error in github.gitdata.getReference', err);
      res.sendStatus(500);
      return;
    }
    var sha = result.object.sha;
    github.gitdata.getTree({
      user: req.user.profile.username,
      repo: req.query.repo_name,
      sha: sha,
      recursive: true
    }, function(err, result) {
      if (err) {
        console.log('error in github.gitdata.getReference', err);
        res.sendStatus(500);
        return;
      }
      res.json(result.tree);
    });
  });
});

app.get('/api/repo/file/blob', function(req, res) {
  if (!req.user) {
    res.json({});
    return;
  }
  var github = getGitHubUserClient(req.user);
  github.gitdata.getBlob({
    user: req.user.profile.username,
    repo: req.query.repo_name,
    sha: req.query.file_sha
  }, function(err, result) {
    if (err) {
      console.log('error in github.gitdata.getBlob', err);
      res.sendStatus(500);
      return;
    }
    delete result.meta;
    res.json(result);
  });
});


app.get(new RegExp('^/static/(.+)\\.html$'), function(req, res) {
  var view_name = req.params[0];
  res.render(view_name);
});

app.use('/static', express.static(path.join(__dirname, 'public')));

var server = http.createServer(app);
var sio = socket_io(server);
server.listen(process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || 5000, process.env.OPENSHIFT_NODEJS_IP, function() {
  console.log('Express server listening.');
});

sio.on('connection', function(socket) {
  socket.on('message', function(data) {
    socket.broadcast.emit('message', data);
  });
});

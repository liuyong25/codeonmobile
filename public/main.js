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

/* global angular: false, io: false, B64: false */

angular.module('MainModule', ['ngRoute', 'ngResource', 'ngTouch', 'ngSanitize', 'ui.ace', 'ui.bootstrap']);

angular.module('MainModule').config(['$routeProvider',
  function($routeProvider) {
    $routeProvider.
    when('/home', {
      templateUrl: 'static/partials/home.html',
      controller: 'HomeCtrl',
      resolve: {
        Profile: 'Profile'
      }
    }).
    when('/repo', {
      templateUrl: 'static/partials/repo.html',
      controller: 'RepoCtrl',
      resolve: {
        Profile: 'Profile'
      }
    }).
    when('/edit', {
      templateUrl: 'static/partials/edit.html',
      controller: 'EditCtrl',
      resolve: {
        Profile: 'Profile'
      }
    }).
    otherwise({
      redirectTo: '/home'
    });
  }
]);

angular.module('MainModule').run(['$rootScope', '$window', '$location',
  function($rootScope, $window, $location) {

    var socket = io.connect($location.absUrl());
    socket.on('message', function(data) {
      $rootScope.$broadcast('handleRemoteMessage', data);
    });
    $rootScope.sendMessage = function(data) {
      socket.emit('message', data);
    };

    angular.element($window).bind('scroll', function() {
      $rootScope.$broadcast('scroll');
    });

  }
]);

angular.module('MainModule').controller('HomeCtrl', ['$scope', 'Profile', 'Repos',
  function($scope, Profile, Repos) {
    $scope.profile = Profile.data;
    Repos.query(function(data) {
      $scope.repos = data;
    });
  }
]);

angular.module('MainModule').controller('RepoCtrl', ['$scope', 'Profile', '$location', 'RepoFiles',
  function($scope, Profile, $location, RepoFiles) {
    $scope.profile = Profile.data;
    $scope.repo_name = $location.search().name;
    $scope.repo_branch = $location.search().branch;
    RepoFiles.query({
      repo_name: $scope.repo_name,
      repo_branch: $scope.repo_branch
    }, function(data) {
      $scope.repo_files = data;
    });
  }
]);

angular.module('MainModule').controller('EditCtrl', ['$scope', 'Profile', '$location', 'RepoFileBlob', '$window', '$timeout',
  function($scope, Profile, $location, RepoFileBlob, $window, $timeout) {
    $scope.profile = Profile.data;
    $scope.repo_name = $location.search().name;
    $scope.repo_branch = $location.search().branch;
    $scope.file_path = $location.search().path;
    $scope.file_sha = $location.search().sha;
    RepoFileBlob.get({
      repo_name: $scope.repo_name,
      file_sha: $scope.file_sha
    }, function(data) {
      if (data.encoding === 'base64') {
        try {
          $scope.content = B64.decode(data.content.replace(/\s/g, ''));
        } catch (e) {
          $window.alert('base64 decode error: ' + e);
        }
      } else {
        $scope.content = data.content;
      }
      $timeout(updateEditorHeight, 10);
    });

    $scope.editorHeight = 200;

    function updateEditorHeight() {
      if (!$scope.aceEditor) return;
      $scope.editorHeight = Math.max(200, (1 + $scope.aceEditor.getSession().getScreenLength()) *
        $scope.aceEditor.renderer.lineHeight +
        $scope.aceEditor.renderer.scrollBar.getWidth());
    }
    $window.addEventListener('resize', function() {
      $scope.$apply(updateEditorHeight);
    });
    var modelist = $window.ace.require('ace/ext/modelist');
    var mode = modelist.getModeForPath($scope.file_path).mode;
    $scope.aceOption = {
      useWrapMode: true,
      showGutter: true,
      theme: 'merbivore',
      mode: mode.match(/\/([^\/]+)$/)[1],
      onLoad: function(editor) {
        $scope.aceEditor = editor;
        var aceTA = $window.document.getElementsByClassName('ace_text-input')[0];
        aceTA.setAttribute('autocorrect', 'off');
        $scope.aceEditor.getSession().selection.on('changeCursor', function() {
          $scope.cursorTop = $scope.aceEditor.renderer.$cursorLayer.getPixelPosition().top + 'px';
        });
      },
      onChange: updateEditorHeight
    };
    $scope.scrollTop = 0;
    $scope.$on('scroll', function() {
      $scope.$apply(function() {
        $scope.scrollTop = $window.document.body.scrollTop;
      });
    });

    $scope.commandMode = false;
    var textareaEle = $window.document.getElementById('panel-textarea');
    angular.element(textareaEle).on('focus', function() {
      $scope.commandMode = true;
    });
    angular.element(textareaEle).on('blur', function() {
      $scope.commandMode = false;
    });
    angular.element(textareaEle).on('keydown', function(event) {
      //console.log(event.keyCode);
      switch (event.keyCode) {
      case 72:
        $scope.aceEditor.navigateLeft();
        break;
      case 74:
        $scope.aceEditor.navigateDown();
        $window.document.body.scrollTop += $scope.aceEditor.renderer.lineHeight;
        break;
      case 75:
        $scope.aceEditor.navigateUp();
        $window.document.body.scrollTop -= $scope.aceEditor.renderer.lineHeight;
        break;
      case 76:
        $scope.aceEditor.navigateRight();
        break;
      case 85:
        $scope.aceEditor.undo();
        break;
      case 82:
        $scope.aceEditor.redo();
        break;
      case 88:
        var session = $scope.aceEditor.getSession();
        var selection = session.selection;
        selection.selectRight();
        session.remove(selection.getRange());
        selection.clearSelection();
        break;
      case 81:
        $scope.aceEditor.focus();
        break;
      }
      event.preventDefault();
    });
    $scope.toggleCommandMode = function() {
      if ($scope.commandMode) {
        $scope.aceEditor.focus();
      } else {
        textareaEle.focus();
      }
    };

  }
]);

angular.module('MainModule').factory('Profile', ['$http',
  function($http) {
    return $http.get('./api/profile');
  }
]);

angular.module('MainModule').factory('Repos', ['$resource',
  function($resource) {
    return $resource('./api/repos', {}, {
      query: {
        method: 'GET',
        isArray: true,
        cache: true
      }
    });
  }
]);

angular.module('MainModule').factory('RepoFiles', ['$resource',
  function($resource) {
    return $resource('./api/repo/files', {}, {
      query: {
        method: 'GET',
        isArray: true,
        cache: true
      }
    });
  }
]);

angular.module('MainModule').factory('RepoFileBlob', ['$resource',
  function($resource) {
    return $resource('./api/repo/file/blob');
  }
]);

// ng-touchstart -> my-touchbegin
angular.module('MainModule').directive('myTouchbegin', ['$parse', '$swipe',
  function($parse, $swipe) {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        var handler = $parse(attrs.myTouchbegin);
        $swipe.bind(element, {
          start: function() {
            scope.$apply(function() {
              handler(scope);
            });
          }
        });
      }
    };
  }
]);

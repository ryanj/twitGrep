var client = {
  'focus': true,
  'tx_errors' : 0
};

// utility functions
util = {
  //  html sanitizer 
  toStaticHTML: function(inputHtml) {
    inputHtml = inputHtml.toString();
    return inputHtml.replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
  }, 
  isBlank: function(text) {
    var blank = /^\s*$/;
    return (text.match(blank) !== null);
  }
};

client.addTweet = function(data) {
  var divElement = $(document.createElement("div"));
  divElement.addClass("tweet");

  // sanitize
  text = util.toStaticHTML(data);
  // replace URLs with links
  text = text.replace(util.urlRE, '<a target="_blank" href="$&">$&</a>');
  divElement.html(text);

  $("#stream").append(divElement);
  scrollDown();
};

client.longPoll = function (data) {
  if (client.tx_errors >= 10) {
    showError();
    return;
  }

  console.log(data);

  //process updates
  if (data && data.tweet) {
    client.addTweet(data.tweet);
  }

  //make another request
  $.ajax({ 
    cache: false, 
    type: "GET", 
    url: "/listen", 
    dataType: "json", 
    data: { }, 
    error: function () {
      client.tx_errors += 1;
      //wait 5 seconds before retrying
      setTimeout(client.longPoll, 5 * 1000);
    }, 
    success: function (data) {
      client.tx_errors = 0;
      client.longPoll(data);
    }
  });
};

//submit a new command to the server
client.send = function(msg) {
  jQuery.get("/command", {command: msg}, function (data) { console.log(data.result);$('#status').text( data.result.toString() ); }, "json");
}

// =MODE TRANSITIONS=

//transition the page to the error screen
showError = function() {
  $("#error").show();
  $("#toolbar").hide();
}

//transition the page to the away screen
showAway = function() {
  $("#away").show();
  $("#toolbar").hide();
}

//transition the page to the loading screen
showLoading = function() {
  $("#loading").show();
  $("#toolbar").hide();
}

//show data stream
showTweets = function() {
  $("#toolbar").show();
  $("#entry").focus();
  $("#loading").hide();
  scrollDown();
}

//keep the most recent tweets visible
scrollDown = function () {
  window.scrollBy(0, 100000000000000000);
  $("#entry").focus();
}

// =EVENT HANDLERS=

//handle the server's response to our listen request
client.onConnect = function (session) {
  //update the UI to show the data stream
  showTweets();

  //listen for browser events so we know to suspend the feed
  $(window).bind("blur", function() {
    client.focus = false;
    // trigger away mode?
  });

  $(window).bind("focus", function() {
    //return from away mode.
    client.focus = true;
  });
  client.longPoll();
}

client.openConnection = function(){
  $.ajax({ 
    cache: false, 
    type: "GET", 
    dataType: "json",
    url: "/open",
    error: function () {
      alert("error connecting to server");
      showError();
    },
    success: client.onConnect
  });
};

//   ------------------------------------------------------------------  //


$(document).ready(function() {
  showLoading();
  //submit new messages when the user hits enter if the message isnt blank
  $("#command_line").keypress(function (e) {
    if (e.keyCode != 13 /* Return */) return;
    var msg = $("#command_line").attr("value").replace("\n", "");
    if (!util.isBlank(msg)) client.send(msg);
    $("#command_line").attr("value", ""); // clear the entry field.
  });

  client.openConnection();

  // remove fixtures
  $("#log").html('');
  showTweets();
  //client.longPoll();
});

//if we can, notify the server that we're going away.
$(window).unload(function () {
  jQuery.get("/close", {}, function (data) { }, "json");
  showLoading();
});

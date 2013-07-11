var http = require('http');
var fs = require('fs');

var attacked_this_turn = false;
var board_graph = JSON.parse(fs.readFileSync("./board_graph.json"));
var board_graph_countries = {};
for (var bg_continents in board_graph){
	for(var bg_countries in board_graph[bg_continents]){
		board_graph_countries[board_graph[bg_continents][bg_countries].name] = board_graph[bg_continents][bg_countries];
	}
}

var serverCreated = false;
var serverPort = process.argv[2];
var my_name;

var serverFunction = function (req, res) {
	console.log("------REQUEST-----");
	var body = '';

	if(req.method == "POST"){
		req.on('data', function(chunk) {
			body += chunk;
		});

		req.on('end', function() {
			body = JSON.parse(decodeURIComponent(body).substring(5).replace(/\+/g, " "));
			req.body = body;
			respond(req, res);
		});
	} else{
		respond(req, res);
	}
};

function respond(req, res){
	if(req.url == "/status"){
		console.log("Replying to Status - 200");
		res.writeHead(200);
		res.end("");
		return;
	}
	if(req.url == "/turn"){
		console.log("It's my turn!");
		res.writeHead(200, {'Content-Type': 'text/json'});
		var game = req.body.game;
		var you = req.body.you;
		my_name = you.name;

		var action = chooseAction(you, game);

		console.log("Action is " + action);

		var response = {"action": action, "data": {}};

		if(action == "choose_country"){
			var countries = [];
			for(var i in game.countries){
				if(game.countries[i].owner == 'none'){
					game.countries[i].name = i;
					countries.push(game.countries[i]);
				}
			}
			response.data = countries[Math.floor(Math.random()*countries.length)].name;
		} else if(action == "deploy_troops"){
			var countries_to_deploy_to = {};
			var my_countries = getOurCountries(game, 0);
			console.log(my_countries);
			for(var k = 0; k < you.troops_to_deploy; k++){
				var country_choice = my_countries[Object.keys(my_countries)[Math.floor(Object.keys(my_countries).length * Math.random())]].name;
				if(typeof(countries_to_deploy_to[country_choice]) == "undefined"){
					countries_to_deploy_to[country_choice] = 1;
				} else{
					countries_to_deploy_to[country_choice] ++;
				}
			}
			for(var m = 0; m < Object.keys(countries_to_deploy_to).length; m ++){
				response.data[Object.keys(countries_to_deploy_to)[m]] = countries_to_deploy_to[Object.keys(countries_to_deploy_to)];
			}
		} else if(action == "use_cards"){
			response.data = findCards(you.cards, []);
		} else if(action == "attack"){
			if(attacked_this_turn === false){
				attacked_this_turn = findAttack(game);
			}
			response.data = {"attacking_country": attacked_this_turn["attacking_country"],
							"defending_country": attacked_this_turn["defending_country"],
							"attacking_troops": 1,
							"moving_troops": attacked_this_turn['attacking_country'].troops - 1};
		} else if(action == "reinforce"){
			response.data = findReinforce(game);
		} else if(action == "end turn" || action == "pass"){
			//pass
		}
		console.log("Response: " + JSON.stringify(response));
		res.end(JSON.stringify(response));
	} else{
		console.log("Got a request for " + req.url + ". Responding with nothing.");
		res.writeHead(200);
		res.end("");
	}
}

function getOurCountries(game, min_num_troops){
	var min_troops = typeof(min_num_troops) == "undefined" ? 0 : min_num_troops;
	var our_countries = {};
	for(var country_index in game.countries){
		if(game.countries[country_index].owner == my_name && game.countries[country_index].troops >= min_troops){
			our_countries[country_index] = game.countries[country_index];
			console.log(board_graph_countries);
			console.log(country_index);
			our_countries[country_index].border_countries = board_graph_countries[country_index].border_countries;
		}
	}
	return our_countries;
}

function findReinforce(game){
	var our_countries = getOurCountries(game, 2);
	var potential_destination_countries = our_countries.slice(0);
	var response = false;
	while(response === false){
		var origin_index = Object.keys(our_countries)[Math.floor(Math.random() * Object.keys(our_countries).length)];
		for(var border_country in our_countries[origin_index].border_countries){
			if(typeof(potential_destination_countries[border_country]) !== "undefined"){
				response = {"origin_country": origin_index, "destination_country": potential_destination_countries[border_country].name, "moving_troops": our_countries[origin_index].troops - 1};
			}
		}
		delete our_countries[origin_index];
	}
	return response;
}

function findAttack(game){
	var our_countries = getOurCountries(game, 2);
	var enemy_countries = []; //enemy countries
	for(var enemy_country_index in board_graph_countries){
		if(typeof(our_countries[board_graph_countries[enemy_country_index]]) == "undefined"){
			enemy_countries.push(our_countries[board_graph_countries[enemy_country_index]]);
		}
	}
	var response = false;
	while(response === false){
		var enemy_country_index = Math.floor(Math.random() * enemy_countries.length);
		for(var border_country_index = 0; border_country_index < enemy_countries[enemy_country_index].border_countries.length; border_country_index++){
			if(typeof(our_countries[enemy_countries[enemy_country_index].border_countries[border_country_index]] !== "undefined")){
				response = {"attacking_country": enemy_countries[enemy_country_index].border_countries[border_country_index], "defending_country": enemy_countries[enemy_country_index]};
			}
		}
		enemy_countries.splice(enemy_country_index, 1);
	}
	return response;
}

function findCards(cards, set){
	for(var i = 0; i < cards.length - 2; i++){
		for (var j = i + 1; j < cards.length - 1; j++){
			for (var k = j + 1; k < cards.length; k++){
				if(isCardSet([cards[i], cards[j], cards[k]])){
					return([cards[i].country, cards[j].country, cards[k].country]);
				}
			}
		}
	}

}

function isCardSet(set){
	for(var i = 0; i < set.length ; i++){
		if(set[i].value == "wild") return true;
	}
	return(set[0].value == set[1].value == set[2].value || set[0].value != set[1].value != set[2].value);
}

function chooseAction(you, game){
	for(var i = 0; i < you.available_actions.length; i++){
		if(you.available_actions[i] == "choose_country"){
			return "choose_country";
		}
		if(you.available_actions[i] == "use_cards" && you.cards.length >= 5){
			return "use_cards";
		}
		if(you.available_actions[i] == "deploy_troops"){
			return "deploy_troops";
		}
		for(var c in game.continents){
			if(typeof(game.continents[c][attacked_this_turn["attacking_country"]]) !== "undefined"){
				attacked_this_turn["attacking_country"] = game.continents[c][attacked_this_turn["attacking_country"]];
			}
			if(typeof(game.continents[c][attacked_this_turn["defending_country"]]) !== "undefined"){
				attacked_this_turn["defending_country"] = game.continents[c][attacked_this_turn["defending_country"]];
			}
		}
		if(you.available_actions[i] == "attack" &&
			(attacked_this_turn === false ||
				(attacked_this_turn['attacking_country'].troops > 1 &&
				attacked_this_turn["defending_country"].owner != my_name)
			)
		){
			return "attack";
		}
		if(you.available_actions[i] == "reinforce"){
			attacked_this_turn = false;
			return "reinforce";
		}
		if(you.available_actions[i] == "end_turn"){
			attacked_this_turn = false;
			return "end_turn";
		}
		if(you.available_actions[i] == "pass"){
			return "pass";
		}
	}
}

http.createServer(serverFunction).listen(serverPort);
console.log("Server started on port " + serverPort);
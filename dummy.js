var http = require('http');
var fs = require('fs');

var attacked_this_turn = false;
var board_graph = JSON.parse(fs.readFileSync("./board_graph.json"));

var board_graph_countries = {};
for (var bg_continents in board_graph){
	for(var bg_countries in board_graph[bg_continents].countries){
		board_graph_countries[bg_countries] = board_graph[bg_continents].countries[bg_countries];
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
		console.log("I am " + my_name);

		var action = chooseAction(you, game);

		console.log("Available actions are " + req.body.you.available_actions);
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
			var my_countries = getMyCountries(game, 0);
			for(var k = 0; k < you.troops_to_deploy; k++){
				var country_choice = Object.keys(my_countries)[Math.floor(Math.random() * Object.keys(my_countries).length)];
				if(typeof(countries_to_deploy_to[country_choice]) == "undefined"){
					countries_to_deploy_to[country_choice] = 1;
				} else{
					countries_to_deploy_to[country_choice] ++;
				}
			}
			for(var m in countries_to_deploy_to){
				response.data[m] = countries_to_deploy_to[m];
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
							"moving_troops": Math.max(0, game.countries[attacked_this_turn['attacking_country']].troops - 2)};
		} else if(action == "reinforce"){
			response.data = findReinforce(game);
			response.data.moving_troops = game.countries[response.data['origin_country']].troops - 1;
		} else if(action == "end_turn" || action == "end_attack_phase" || action == "pass"){
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

function getMyCountries(game, min_num_troops){
	var our_countries = {};
	for(var country_index in game.countries){
		if(game.countries[country_index].owner == my_name && game.countries[country_index].troops >= min_num_troops){
			our_countries[country_index] = game.countries[country_index];
			our_countries[country_index]["border countries"] = board_graph_countries[country_index]["border countries"];
		}
	}
	return our_countries;
}

function findReinforce(game){
	var my_countries = getMyCountries(game, 2);
	while(true){
		var origin_country_name = Object.keys(my_countries)[Math.floor(Math.random() * Object.keys(my_countries).length)];
		for(var border_country_index in board_graph_countries[origin_country_name]["border countries"]){
			var border_country_name = board_graph_countries[origin_country_name]["border countries"][border_country_index];
			if(game.countries[border_country_name].owner == my_name && game.countries[border_country_name].troops > 1){
				return {"destination_country": border_country_name, "origin_country": origin_country_name};
			}
		}
		delete my_countries[origin_country_name];
	}
}

function findAttack(game){
	var enemy_countries = []; //enemy countries
	for(var potential_enemy_name in board_graph_countries){
		if(game.countries[potential_enemy_name].owner != my_name){
			enemy_countries.push(potential_enemy_name);
		}
	}
	while(true){
		var enemy_country_index = Math.floor(Math.random() * enemy_countries.length);
		for(var border_country_index in board_graph_countries[enemy_countries[enemy_country_index]]["border countries"]){
			var border_country_name = board_graph_countries[enemy_countries[enemy_country_index]]["border countries"][border_country_index];
			if(game.countries[border_country_name].owner == my_name){
				return {"attacking_country": border_country_name, "defending_country": enemy_countries[enemy_country_index]};
			}
		}
		enemy_countries.splice(enemy_country_index, 1);
	}
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
		if(you.available_actions[i] == "end_attack_phase"){
			return "end_attack_phase";
		}
		if(you.available_actions[i] == "pass"){
			return "pass";
		}
	}
}

http.createServer(serverFunction).listen(serverPort);
console.log("Server started on port " + serverPort);
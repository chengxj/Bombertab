/*
 ** Developer : 20tab srl (www.20tab.com) 
 ** Date : 20 june 2013
 ** All code (c)2013 20tab srl
*/



/*

    IN
        e enemies-list [[p,a,x,y],[...]..]
        b arena-block-list [0,1,0,1,0,1,0...]
        p player-id (int)
        a player-avatar (e v m)
        u player-username (string)
        x player-pos-x (int)
        y player-pos-y (int)
        d player-direction (n s w e)
        o player-old-direction (n s w e)
        i bomb-id (int)
        c cmd:
            z welcome
            m move player p in x,y
            p add player p in x,y
            k kill player p
            b drop bomb i in x,y
            x explode bomb i
            0 stop player p in x,y
            v vincitore p

    OUT
        p player-id (int)
        a player-avatar (e v m)
        u player-username
        c cmd:
            j join arena with avatar a
            //r ready-drop-new-bomb
            J join again
            b drop bomb
            w move west
            e move est
            n move north
            s move south
            0 stop

*/


jQuery(function(){
    var	SOCKET_ADDRESS = "ws://10.30.31.123:9090/tremolo";
	var RATE = 60;

	var BORDER_CELL = 0;
	var CELLS_NUMBER_W = 19;
	var CELLS_NUMBER_H = 11;
	var CELL_W = 50;
	var CELL_H = CELL_W;
	var PG_W = (CELL_W+BORDER_CELL*2)*CELLS_NUMBER_W;
	var PG_H = (CELL_H+BORDER_CELL*2)*CELLS_NUMBER_H;
	var ACTOR_W = 50;
	var ACTOR_H = 70;
	var BOMB_W = 150;
	var BOMB_H = 150;
	var EXPLOSION_W = 150;
	var EXPLOSION_H = 150;
	
	var player_id = 0;
	var game_over = false;
	var events = Array();
    var players = {};
    var bombs = {};


    /* objects */

    function Bomb(id, posx, posy, owner_id){
        this.id = id;
        this.posx = posx;
        this.posy = posy;
        this.owner_id = owner_id;
        var that = this;

        this.create = function create(){
            if($("#bomb_"+this.id).get()){
                write_log('p: '+this.owner_id+' | inizio sequenza drop '+'i: '+this.id,'red');
                bombSound["drop"].play();
                $.playground()
                    .addGroup("bomb_"+this.id, {posx: this.posx, posy: this.posy, width: BOMB_W, height: BOMB_H})
                          .addSprite("bombBody_"+this.id,{
                                animation: bombAnimation["drop"],
                                posx: -50, posy: -50, width: BOMB_W, height: BOMB_H, 
                                callback: function(){
                                    write_log('p: '+that.owner_id+' | inizio sequenza loop '+'i: '+that.id,'red');
                                    bombSound["loop"].play();
                                    $("#bombBody_"+that.id).setAnimation(bombAnimation["loop"]);
                                }
                            });	              
            }
        }

        this.explode = function explode(){
            write_log('p: '+this.owner_id+' | esplode la bomba '+'i: '+this.id,'red'); 
            bombSound["loop"].pause();
            bombSound["explode"].play();       
            $("#bombBody_"+this.id).setAnimation(bombAnimation["explode"],           	    	
                function(){
                    write_log('p: '+that.owner_id+' | rimuovendo la bomba '+'i: '+that.id,'red');
                    $("#bomb_"+that.id).remove();
                    write_log('p: '+that.owner_id+' | rimossa la bomba '+'i: '+that.id,'red'); 
                    delete bombs[that.id]; 
                }
            );
        }
    }

    function Player(id, username, avatar, posx, posy){
        this.id = id;
        this.username = username;
        this.avatar = avatar;
        this.posx = posx;
        this.posy = posy;
        this.direction = 'e';
        this.old_direction = 'e'
        this.dead = false;
        this.player = false;
        var that = this;

        this.create = function create(){
            $.playground().addGroup("player_"+this.id, {posx: this.posx, posy: this.posy, width: ACTOR_W, height: ACTOR_H})
                 .addSprite("playerBody_"+this.id,{animation: playerAnimation[this.avatar+"_idle"],
                       posx: 0, posy: 0, width: ACTOR_W, height: ACTOR_H});
            if(!this.player){stats_class = 'stats_enemy';}else{stats_class = 'stats_player';}
            $('#game_stats').append('<div class="'+stats_class+'" id="stats_p_'+this.id+'"><p>'+this.username+' ('+this.id+')</p></div>');
            $("<div class='username_box'>"+this.username+"</div>").appendTo('#playerBody_'+this.id);
        }

        this.reborn = function reborn(){
            this.posx = 0;
            this.posy = 0;  
            this.dead = false;
        }

        this.set_player = function set_player(){
            this.player = true;
            player_id = this.id;
        }

        this.move = function move(new_dir, old_dir, x, y){
            this.posx = x;
            this.posy = y;
            this.direction = new_dir;
            this.old_direction = old_dir;           
            write_log('p: '+this.id+'/'+this.avatar+' | d: '+new_dir+" - o: "+old_dir);
            if(new_dir != old_dir){   //changing direction compared to previous frame
                write_log('p: '+this.id+'/'+this.avatar+' | cambio dir','orange');
                $("#playerBody_"+this.id).setAnimation(playerAnimation[this.avatar+"_"+new_dir]);
            }
            //in any case I have to move the player to the new coord
            $("#player_"+this.id).css("left", x+"px");
            $("#player_"+this.id).css("top", y+"px");           
        }

        this.stop = function stop(direction){
            write_log('p: '+this.id+'/'+this.avatar+' | idle','blue');
            switch(direction){  // controllo quale direzione viene passata
                case "n" || "e" || "s" || "w":
                    $("#playerBody_"+this.id).setAnimation(playerAnimation[this.avatar+"_idle-"+direction]);
                    break;
                default:
                    $("#playerBody_"+this.id).setAnimation(playerAnimation[this.avatar+"_idle"]);
                    break;
            } 
        }

        this.drop_bomb = function drop_bomb(bombid, bombx, bomby){
            write_log('p: '+this.id+' | lascio la bomba '+'i: '+bombid,'red');
            bombs[bombid] = new Bomb(bombid, bombx, bomby, this.id);
            bombs[bombid].create();
        }

        // v - winner
        this.win = function win(){
            if(this.player){
                $('#game_over h2').removeClass().addClass('winner').html('WINNER');
                $('#game_over').fadeIn();
                gameSound["winner"].play();                   
            } 
            write_log('p: '+this.id+' | VITTORIA!','green'); 
            $("#playerBody_"+this.id).setAnimation(playerAnimation[this.avatar+"_winner"],           	    	
                function(){
                    //$.playground().pauseGame();
                    write_log('p: '+that.id+' | FINE GIOCO ','red');  
                    write_log('p: '+that.id+' | rimuovendo dopo vittoria','red');
                    $("#player_"+that.id).remove();
                    $("#stats_p_"+that.id).remove();
                    write_log('p: '+that.id+' | vincitore rimosso','red');
                    if(that.player){
                        $('#play_again').fadeIn();
                    }
                }
            ); 
        }

        this.die = function die(){
            this.dead = true;
            playerSound["die"].play();
            write_log('p: '+this.id+' | dying','red');
            $("#playerBody_"+this.id).setAnimation(
                playerAnimation[this.avatar+"_die"],
                function(){
                    write_log('p: '+that.id+' | removing','red');
                    $("#player_"+that.id).remove();
                    $("#stats_p_"+that.id).remove();
                    write_log('p: '+that.id+' | dead and removed','red');
                    if(that.id == player_id){  //player_over
                        player_over = true;
                        anim_player_over();
                        write_log('p: '+that.id+' | CURRENT PLAYER GAME OVER','red');
                    }
                }
            ); // /setAnimation
        } // /die

    } // /Player 

	
	
	
	/* log */
	var DEBUG = false;
    $('#debug_button input').click(function(){
        DEBUG = $(this).is(":checked");
    });
	var last_log = [new Date(),new Date(),new Date()];
	function write_log(str, color, table){
	    if(DEBUG){
	        if(!color){color = 'black';}
	        if(!table){table = 0;} //0=screen 1=in 2=out
        	var d = new Date();
        	diff = d - last_log[table];
        	if(diff > 64){
        	    $("#log_"+table).prepend('<b style="color:red; font-size: 1.1em;">interval:'+diff+'</b> ');
        	}
	        $("#log_"+table).prepend('<span style="color:'+color+'">'+d.getHours()+':'+d.getMinutes()+':'+d.getSeconds()+':'+d.getMilliseconds()+' '+str+'</span><br/>');
	        last_log[table] = d;
	    }
	}
	/* /log */
	
	
	function arena(grid){
		var html_grid = "" 
		var i = 0;
		var pos = 0;
		while( i < grid.length){
			html_grid += '<div class="grid-row">'; 
			var j = 0;
			while(j < CELLS_NUMBER_W){
				var type = "brick";
				if(!grid[pos]){
					type = "lawn";
				}
				html_grid += '<div class="grid-cell '+type+'"></div>';
				j++;
				pos++;
			}
			html_grid += '<div class="fixfloat"></div></div>' 
			i++;
		}
		return html_grid;
	}
	var playerAnimation = Array();
	var playerSound = Array();
	var bombAnimation = Array();
	var bombSound = Array();
	var gameSound = Array();
	
	function init_arena(){
		
		// inizializzo la griglia con la sprite  da usare
		$.playground().addSprite('grid',{height: PG_H, width: PG_W}).end();
		
		// imposto le animazioni da usare
		playerAnimation["e_idle"] = 	new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
	    playerAnimation["e_e"]      = new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
        playerAnimation["e_idle-e"]      = new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
	    playerAnimation["e_w"] =	new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:225
        	});
        playerAnimation["e_idle-w"] =	new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:225
        	});
	    playerAnimation["e_n"] = 	new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:0
        	});
        playerAnimation["e_idle-n"] = 	new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:0
        	});
	    playerAnimation["e_s"] = 	new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:150
        	});
        playerAnimation["e_idle-s"] = 	new $.gameQuery.Animation({
        	imageURL: "img/emperor.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:150
        	});
        playerAnimation["e_die"] = 	new $.gameQuery.Animation({
        	imageURL: "img/emperor_die.png", numberOfFrame: 30, delta: 50, rate: 130, type: $.gameQuery.ANIMATION_HORIZONTAL | $.gameQuery.ANIMATION_CALLBACK, offsetx:0, offsety:0
        	});
        playerAnimation["e_winner"] = 	new $.gameQuery.Animation({
        	imageURL: "img/emperor_winner.png", numberOfFrame: 30, delta: 50, rate: 130, type: $.gameQuery.ANIMATION_HORIZONTAL | $.gameQuery.ANIMATION_CALLBACK, offsetx:0, offsety:0
        	});
        	
		playerAnimation["v_idle"] = 	new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
	    playerAnimation["v_e"]      = new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
        playerAnimation["v_idle-e"]      = new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
	    playerAnimation["v_w"] =	new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:225
        	});
        playerAnimation["v_idle-w"] =	new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:225
        	});
	    playerAnimation["v_n"] = 	new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:0
        	});
        playerAnimation["v_idle-n"] = 	new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:0
        	});
	    playerAnimation["v_s"] = 	new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:150
        	});
        playerAnimation["v_idle-s"] = 	new $.gameQuery.Animation({
        	imageURL: "img/vassal.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:150
        	});
        playerAnimation["v_die"] = 	new $.gameQuery.Animation({
        	imageURL: "img/vassal_die.png", numberOfFrame: 30, delta: 50, rate: 130, type: $.gameQuery.ANIMATION_HORIZONTAL | $.gameQuery.ANIMATION_CALLBACK, offsetx:0, offsety:0
        	});
        playerAnimation["v_winner"] = 	new $.gameQuery.Animation({
        	imageURL: "img/vassal_winner.png", numberOfFrame: 28, delta: 50, rate: 130, type: $.gameQuery.ANIMATION_HORIZONTAL | $.gameQuery.ANIMATION_CALLBACK, offsetx:0, offsety:0
        	});
        	
		playerAnimation["m_idle"] = 	new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
	    playerAnimation["m_e"]      = new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
        playerAnimation["m_idle-e"]      = new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:75
        	});
	    playerAnimation["m_w"] =	new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:225
        	});
        playerAnimation["m_idle-w"] =	new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:225
        	});
	    playerAnimation["m_n"] = 	new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:0
        	});
        playerAnimation["m_idle-n"] = 	new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:0
        	});
	    playerAnimation["m_s"] = 	new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 2, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:150
        	});
        playerAnimation["m_idle-s"] = 	new $.gameQuery.Animation({
        	imageURL: "img/mule.png", numberOfFrame: 1, delta: 50, rate: 250, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:150
        	});
        playerAnimation["m_die"] = 	new $.gameQuery.Animation({
        	imageURL: "img/mule_die.png", numberOfFrame: 30, delta: 50, rate: 130, type: $.gameQuery.ANIMATION_HORIZONTAL | $.gameQuery.ANIMATION_CALLBACK, offsetx:0, offsety:0
        	});
        playerAnimation["m_winner"] = 	new $.gameQuery.Animation({
        	imageURL: "img/mule_winner.png", numberOfFrame: 30, delta: 50, rate: 130, type: $.gameQuery.ANIMATION_HORIZONTAL | $.gameQuery.ANIMATION_CALLBACK, offsetx:0, offsety:0
        	});
        	
	    bombAnimation["drop"] =	new $.gameQuery.Animation({
        	imageURL: "img/bomb_drop.png", numberOfFrame: 5, delta: 150, rate: 100, type: $.gameQuery.ANIMATION_HORIZONTAL | $.gameQuery.ANIMATION_CALLBACK, offsetx:0, offsety:0
        	});
	    bombAnimation["loop"] = new $.gameQuery.Animation({
        	imageURL: "img/bomb_loop.png", numberOfFrame: 4, delta: 150, rate: 100, type: $.gameQuery.ANIMATION_HORIZONTAL, offsetx:0, offsety:0
        	});
	    bombAnimation["explode"] =	new $.gameQuery.Animation({
        	imageURL: "img/bomb_explode.png", numberOfFrame: 12, delta: 150, rate: 100, type: $.gameQuery.ANIMATION_HORIZONTAL | $.gameQuery.ANIMATION_CALLBACK, offsetx:0, offsety:0
        	});
        bombSound["explode"] = new Audio("sounds/bomb_explode.mp3");
        bombSound["drop"] = new Audio("sounds/bomb_drop.mp3");
        bombSound["loop"] = new Audio("sounds/bomb_loop.mp3");
        playerSound["die"] = new Audio("sounds/player_die.mp3");
        gameSound["winner"] = new Audio("sounds/winner.mp3");
        
        
        // adding players
        for(p in players){
            players[p].create();
        }
		
        $.playground().registerCallback(eventsManager, RATE);
	}
	
	if (!"WebSocket" in window) {
		alert("WebSockets are not supported by your Browser!");
	}
	
		
	var ws;
	
 	var send_stop = true;
 	
 	// utility functions
 	function anim_player_over(){
 	    $('#game_over h2').removeClass().addClass('loser').html('GAME OVER');
 	    $('#game_over').fadeIn();
        $('#play_again').fadeIn();
 	}
 	
    $('#play_again').on('click',function(){
        ws.send('{"c":"J", "a":"'+avatar+'", "u":"'+username+'", "p":"'+player_id+'"}');
        write_log('p: '+player_id+' | CURRENT PLAYER JOIN AGAIN','green',2);
        $('#play_again').fadeOut();
        $('#game_over').fadeOut();
    });
    
       

	
	
	function eventsManager(){
        player_over = players[player_id].dead;
	
	    if(jQuery.gameQuery.keyTracker[32] && !player_over){ //this is bomb! (space) bomb is out of 'if' cause you can drop it while moving
			var message = {'c':'b','p':player_id};
		    ws.send(JSON.stringify(message));
		    write_log('send msg: '+JSON.stringify(message),'black',2);
	        send_stop = true;
		}
	
		if((jQuery.gameQuery.keyTracker[65] || jQuery.gameQuery.keyTracker[37]) && !player_over){ //this is left! (a or arrow-left)
			var message = {'c':'w','p':player_id};
			ws.send(JSON.stringify(message));
		    write_log('send msg: '+JSON.stringify(message),'black',2);
            send_stop = true;
    	}
		else if((jQuery.gameQuery.keyTracker[87] || jQuery.gameQuery.keyTracker[38]) && !player_over){ //this is up! (w or arrow-up)
			var message = {'c':'n','p':player_id};
			ws.send(JSON.stringify(message));
		    write_log('send msg: '+JSON.stringify(message),'black',2);
            send_stop = true;
		}
    	else if((jQuery.gameQuery.keyTracker[68] || jQuery.gameQuery.keyTracker[39]) && !player_over){ //this is right! (d or arrow-right)
			var message = {'c':'e','p':player_id};
			ws.send(JSON.stringify(message));
		    write_log('send msg: '+JSON.stringify(message),'black',2);
            send_stop = true;
		}
		else if((jQuery.gameQuery.keyTracker[83] || jQuery.gameQuery.keyTracker[40]) && !player_over){ //this is down! (s or arrow-down)
			var message = {'c':'s','p':player_id};
			ws.send(JSON.stringify(message));
		    write_log('send msg: '+JSON.stringify(message),'black',2);
            send_stop = true;
		}
		else if(send_stop){
		    var message = {'c':'0','p':player_id};
		    ws.send(JSON.stringify(message));
		    write_log('send msg: '+JSON.stringify(message),'black',2);
            send_stop = false;
		}
		
		while((msg_queue = events.pop()) != null){ 
	        var msg = msg_queue;
	        write_log('c: '+msg['c']+' - p: '+msg['p']+'/'+msg['a']+' | msg processed','green');  
            
			switch(msg['c']){  // checking command 
			    case "m": // m=move (move player p in direction d from old direction o at coord x and y)
                    players[msg['p']].move(msg['d'], msg['o'], msg['x'], msg['y']);        
			    	break;
			    case "p": // p=add_player (add player p with username u and avatar a at coord x and y)
                    try{
                        new_player = players[msg['p']];
                        if(new_player.dead){
                            new_player.reborn();
                            new_player.create();
                        }
                        //else is not possible here
                    }catch(err){
                        //if(err=='ReferenceError' || err=='TypeError'){
                            players[msg['p']] = new Player(msg['p'],msg['u'],msg['a'],msg['x'],msg['y']);
                            players[msg['p']].create();
                        //}
                    }
	                break;
                case "k": // k=kill (remove player 'p')
                    players[msg['p']].die();
        	        break;
        	    case "b": // b=bomb (drop bomb i at player p coord x and y)
                    players[msg['p']].drop_bomb(msg['i'],msg['x'],msg['y']);
                    break;
                case "x": // x=explosion (explode bomb i)
                    bombs[msg['i']].explode();
        	    	break;
        	    case "0": // 0=stop (player p stops in direction d)
                    players[msg['p']].stop(msg['d']);
        	    	break;
        	    case "v": // v=win (player p wins))
			        players[msg['p']].win();
			    	break;
			    default:
			    	break;
			}
		}
	}
	
	
	$('.choose_player').on('click',function(){
      var username_input = $('#username_input').val();
      if(username_input == ''){
        $('#username_input').css('border', '5px red solid');
      }else{
        username = username_input;
	    //$('#startGame').html();
	    
	    avatar = $(this).data('avatar');
	    $('#select_player').fadeOut();
	    $('#playground').fadeIn();
	    $('#playground').playground({height: PG_H, width: PG_W, keyTracker: true})
	    
		$.playground().startGame(function(){
			ws = new WebSocket(SOCKET_ADDRESS);
			ws.onopen = function() {
			        ws.send('{"c":"j", "a":"'+avatar+'", "u":"'+username+'"}');   //c=command  j=join (ask server to join)  a=avatar e(mperor) v(assal) m(ule)
			};
			
			ws.onmessage = function(evt) {   // when websocket receives a message
			    var msg_in = jQuery.parseJSON(evt.data);
			    write_log('received msg: '+JSON.stringify(msg_in),'black',1);
				    switch(msg_in['c']){  // checking the received command
				        case "z": // z=welcome (server accepted you, send p=player_id, x=x_coord, y=y_coord, e=enemies list, b=arena_block_list) 
			    	        players[msg_in['p']] = new Player(msg_in['p'],msg_in['u'],msg_in['a'],msg_in['x'],msg_in['y']);
				            players[msg_in['p']].set_player(); // set the current player is me
				            $.playground().clearAll(true);
                            enemies = msg_in['e'];
                            for(i in enemies){
                                players[enemies[i][0]] = new Player(enemies[i][0],enemies[i][4],enemies[i][1],enemies[i][2],enemies[i][3]);
                            }
				            init_arena();
				            $("#grid").html(arena(msg_in['b']));
				            break;
				        default: // all the other commands will be queued
				        	events.push(msg_in);
				        	break;
				    }
			};			        

			ws.onclose = function() {
                $.playground().clearAll(true);
				alert("Connection is closed..."); 
			};
		}); /*startgame*/
      }/*endif*/
	}); /*choose_player onclick*/
}); /*jQuery*/



